import { createClient, Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Cafe, Data, emptyData, normalizeRecipe, Recipe } from './domain';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const cloud = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true,
    storage: {getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync},
  },
}) : null;
export type LoginProvider = 'google' | 'apple';
export type ReportTarget = 'cafe' | 'recipe';
export type ReportReason = '스팸' | '부적절한 콘텐츠' | '저작권 침해' | '기타';
export type ModerationStatus = {status:'pending'|'approved'|'rejected';reviewNote?:string};
export async function login(provider: LoginProvider): Promise<Session | null> {
  if (!cloud) throw new Error('로그인 서버 설정이 필요합니다.');
  if(provider==='apple') {
    try {
      const random=await Crypto.getRandomBytesAsync(32);
      const rawNonce=Array.from(random,byte=>byte.toString(16).padStart(2,'0')).join('');
      const hashedNonce=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,rawNonce);
      const credential=await AppleAuthentication.signInAsync({
        requestedScopes:[AppleAuthentication.AppleAuthenticationScope.FULL_NAME,AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce:hashedNonce,
      });
      if(!credential.identityToken)throw new Error('Apple 인증 토큰을 받지 못했습니다.');
      const result=await cloud.auth.signInWithIdToken({provider:'apple',token:credential.identityToken,nonce:rawNonce});
      if(result.error)throw result.error;
      let appleSession=result.data.session;
      const fullName=[credential.fullName?.givenName,credential.fullName?.middleName,credential.fullName?.familyName].filter(Boolean).join(' ');
      if(fullName){
        const update=await cloud.auth.updateUser({data:{full_name:fullName,given_name:credential.fullName?.givenName,family_name:credential.fullName?.familyName}});
        if(update.error)throw update.error;
        if(appleSession)appleSession={...appleSession,user:update.data.user};
      }
      return appleSession;
    }catch(error){
      if(error instanceof Error && 'code' in error && (error as Error&{code?:string}).code==='ERR_REQUEST_CANCELED')return null;
      throw error;
    }
  }
  const redirectTo='caferecipes://auth/callback';
  const {data,error}=await cloud.auth.signInWithOAuth({provider,options:{redirectTo,skipBrowserRedirect:true}});
  if(error)throw error;
  const result=await WebBrowser.openAuthSessionAsync(data.url,redirectTo);
  if(result.type!=='success')return null;
  const callback=new URL(result.url);
  if(!result.url.startsWith(redirectTo))throw new Error('잘못된 로그인 응답입니다.');
  const code=callback.searchParams.get('code');
  if(!code)throw new Error(callback.searchParams.get('error_description')??'로그인이 완료되지 않았습니다.');
  const exchange=await cloud.auth.exchangeCodeForSession(code);
  if(exchange.error)throw exchange.error;
  return exchange.data.session;
}
export async function loadAccount(session:Session):Promise<Data> {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const {data,error}=await cloud.from('cafe_accounts').select('state').eq('owner_id',session.user.id).maybeSingle();
  if(error)throw error;
  const state={...emptyData,...data?.state,active:true,name:data?.state?.name??session.user.user_metadata.full_name??'내 프로필'} as Data;
  return {...state,recipes:(state.recipes??[]).map(normalizeRecipe),draft:state.draft?normalizeRecipe(state.draft):null};
}
export async function saveAccount(state:Data, session:Session):Promise<Data> {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const uploadedPaths:string[]=[];
  async function uploadMedia(uri:string, recipeId:string, label:string, kind:'image'|'video') {
    if(/^https?:\/\//.test(uri))return uri;
    let uploadUri=uri;
    if(kind==='image'){
      const context=ImageManipulator.ImageManipulator.manipulate(uri);
      const rendered=await context.renderAsync();
      uploadUri=(await rendered.saveAsync({compress:0.9,format:ImageManipulator.SaveFormat.JPEG})).uri;
    }
    const file=new File(uploadUri);
    if(file.size>10*1024*1024)throw new Error('사진과 영상은 파일당 10MB 이하만 게시할 수 있어요.');
    const content=await file.arrayBuffer();
    const safe=`${recipeId}-${label}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g,'-');
    const path=`${session.user.id}/${safe}${file.extension || (kind==='video'?'.mp4':'.jpg')}`;
    const upload=await cloud!.storage.from('recipe-images').upload(path,content,{contentType:file.type || (kind==='video'?'video/mp4':'image/jpeg')});
    if(upload.error)throw upload.error;
    uploadedPaths.push(path);
    return cloud!.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
  }
  try {
    // Device drafts stay private. Only explicitly published recipes enter the catalog.
    const next:Data={...state,cafe:state.cafe?{...state.cafe,id:session.user.id}:null,recipes:[]};
    for(const recipe of state.recipes){
      let photo=recipe.photo;
      if(photo)photo=await uploadMedia(photo,recipe.id,'cover','image');
      const steps=[];
      for(const step of recipe.steps){
        const media=step.media?{...step.media,uri:await uploadMedia(step.media.uri,recipe.id,step.id,step.media.type)}:undefined;
        steps.push({...step,media});
      }
      next.recipes.push({...recipe,steps,photo,cafeId:session.user.id});
    }
    const {error}=await cloud.rpc('save_cafe_account',{next_state:next});
    if(error)throw error;
    await cleanupUnusedMedia(next,session).catch(()=>undefined);
    return next;
  } catch(error) {
    if(uploadedPaths.length)await cloud.storage.from('recipe-images').remove(uploadedPaths).catch(()=>undefined);
    throw error;
  }
}
function storagePath(uri:string):string|null {
  const marker='/storage/v1/object/public/recipe-images/';
  const index=uri.indexOf(marker);
  return index<0?null:decodeURIComponent(uri.slice(index+marker.length));
}
export async function cleanupUnusedMedia(state:Data,session:Session) {
  if(!cloud)return;
  const active=new Set<string>();
  for(const recipe of state.recipes){
    if(recipe.photo){const path=storagePath(recipe.photo);if(path)active.add(path);}
    for(const step of recipe.steps){if(step.media){const path=storagePath(step.media.uri);if(path)active.add(path);}}
  }
  const obsolete:string[]=[];
  for(let offset=0;;offset+=100){
    const page=await cloud.storage.from('recipe-images').list(session.user.id,{limit:100,offset});
    if(page.error)throw page.error;
    for(const object of page.data??[]){
      const path=`${session.user.id}/${object.name}`;
      if(!active.has(path))obsolete.push(path);
    }
    if((page.data?.length??0)<100)break;
  }
  for(let index=0;index<obsolete.length;index+=100){
    const removal=await cloud.storage.from('recipe-images').remove(obsolete.slice(index,index+100));
    if(removal.error)throw removal.error;
  }
}
export async function catalog():Promise<{cafes:Cafe[];recipes:Recipe[]}> {
  if(!cloud)return {cafes:[],recipes:[]};
  const {data,error}=await cloud.from('cafe_catalog').select('cafe,recipes');
  if(error)throw error;
  return {cafes:(data??[]).map(row=>row.cafe),recipes:(data??[]).flatMap(row=>row.recipes).map(normalizeRecipe)};
}
export async function reportContent(targetType:ReportTarget,targetId:string,reason:ReportReason) {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const {error}=await cloud.rpc('submit_report',{report_target_type:targetType,report_target_id:targetId,report_reason:reason});
  if(error)throw error;
}
export async function loadRecipeModerationStatuses():Promise<Record<string,ModerationStatus>> {
  if(!cloud)return {};
  const {data,error}=await cloud.from('recipe_moderation').select('recipe_id,status,review_note');
  if(error)throw error;
  return Object.fromEntries((data??[]).map(row=>[row.recipe_id,{status:row.status,reviewNote:row.review_note??undefined}]));
}
export async function loadBlockedOwnerIds():Promise<string[]> {
  if(!cloud)return [];
  const {data,error}=await cloud.from('blocks').select('blocked_owner_id');
  if(error)throw error;
  return (data??[]).map(row=>row.blocked_owner_id);
}
export async function blockOwner(ownerId:string) {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const user=(await cloud.auth.getUser()).data.user;
  if(!user)throw new Error('차단하려면 로그인해 주세요.');
  if(user.id===ownerId)throw new Error('내 Cafe는 차단할 수 없습니다.');
  const {error}=await cloud.from('blocks').upsert({blocker_id:user.id,blocked_owner_id:ownerId});
  if(error)throw error;
}
export async function unblockOwner(ownerId:string) {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const {error}=await cloud.from('blocks').delete().eq('blocked_owner_id',ownerId);
  if(error)throw error;
}
export async function deleteAccount(session:Session) {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const paths=await cloud.rpc('cafe_account_storage_paths');
  if(paths.error)throw paths.error;
  const names=(paths.data??[]).map((row:{name:string})=>row.name);
  for(let index=0;index<names.length;index+=100){
    const removal=await cloud.storage.from('recipe-images').remove(names.slice(index,index+100));
    if(removal.error)throw removal.error;
  }
  const result=await cloud.rpc('delete_cafe_account');
  if(result.error)throw result.error;
  await cloud.auth.signOut({scope:'local'});
}
