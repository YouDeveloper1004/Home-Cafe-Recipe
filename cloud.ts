import { createClient, Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Cafe, Data, emptyData, normalizeRecipe, Recipe, StorageBucket } from './domain';

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
const PRIVATE_MEDIA_BUCKET='recipe-media-private';
const LEGACY_MEDIA_BUCKET='recipe-images';
const MEDIA_REFERENCE_PREFIX='ratio-media://';
const LEGACY_MEDIA_REFERENCE_PREFIX='ratio-legacy-media://';
const SIGNED_MEDIA_TTL_SECONDS=60*60;
const videoUploadEnabled=process.env.EXPO_PUBLIC_VIDEO_UPLOAD_ENABLED==='true';

function mediaLocation(uri?:string,storagePath?:string,storageBucket?:StorageBucket):{path:string;bucket:StorageBucket}|null {
  if(storagePath)return {path:storagePath,bucket:storageBucket??PRIVATE_MEDIA_BUCKET};
  if(uri?.startsWith(MEDIA_REFERENCE_PREFIX))return {path:decodeURIComponent(uri.slice(MEDIA_REFERENCE_PREFIX.length)),bucket:PRIVATE_MEDIA_BUCKET};
  if(uri?.startsWith(LEGACY_MEDIA_REFERENCE_PREFIX))return {path:decodeURIComponent(uri.slice(LEGACY_MEDIA_REFERENCE_PREFIX.length)),bucket:LEGACY_MEDIA_BUCKET};
  for(const bucket of [PRIVATE_MEDIA_BUCKET,LEGACY_MEDIA_BUCKET] as StorageBucket[]){
    for(const marker of [`/storage/v1/object/public/${bucket}/`,`/storage/v1/object/sign/${bucket}/`]){
      const index=uri?.indexOf(marker)??-1;
      if(index>=0)return {path:decodeURIComponent(uri!.slice(index+marker.length).split('?')[0]),bucket};
    }
  }
  return null;
}

async function hydrateRecipeMedia(recipe:Recipe):Promise<Recipe> {
  if(!cloud)return recipe;
  const sign=async(uri?:string,storagePath?:string,storageBucket?:StorageBucket):Promise<{uri?:string;storagePath?:string;storageBucket?:StorageBucket}>=>{
    const location=mediaLocation(uri,storagePath,storageBucket);
    if(!location)return {uri,storagePath,storageBucket};
    const signed=await cloud!.storage.from(location.bucket).createSignedUrl(location.path,SIGNED_MEDIA_TTL_SECONDS);
    if(signed.error)throw signed.error;
    return {uri:signed.data.signedUrl,storagePath:location.path,storageBucket:location.bucket};
  };
  const cover=await sign(recipe.photo,recipe.photoStoragePath,recipe.photoStorageBucket);
  const steps=await Promise.all(recipe.steps.map(async step=>{
    if(!step.media)return step;
    const resolved=await sign(step.media.uri,step.media.storagePath,step.media.storageBucket);
    return {...step,media:{...step.media,uri:resolved.uri??'',storagePath:resolved.storagePath,storageBucket:resolved.storageBucket}};
  }));
  return {...recipe,steps,photo:cover.uri,photoStoragePath:cover.storagePath,photoStorageBucket:cover.storageBucket};
}
function hasAppleIdentity(session:Session) {
  const providers=session.user.app_metadata?.providers;
  return session.user.app_metadata?.provider==='apple'||(Array.isArray(providers)&&providers.includes('apple'))||session.user.identities?.some(identity=>identity.provider==='apple');
}
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
  const recipes=await Promise.all((state.recipes??[]).map(normalizeRecipe).map(hydrateRecipeMedia));
  return {...state,recipes,draft:state.draft?normalizeRecipe(state.draft):null};
}
export async function saveAccount(state:Data, session:Session):Promise<Data> {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  const uploadedPaths:string[]=[];
  async function uploadMedia(uri:string, storagePath:string|undefined, storageBucket:StorageBucket|undefined, recipeId:string, label:string, kind:'image'|'video') {
    const existing=mediaLocation(uri,storagePath,storageBucket);
    if(existing)return {uri:`${existing.bucket===PRIVATE_MEDIA_BUCKET?MEDIA_REFERENCE_PREFIX:LEGACY_MEDIA_REFERENCE_PREFIX}${existing.path}`};
    if(/^https?:\/\//.test(uri))return {uri,storagePath:undefined};
    if(kind==='video'&&!videoUploadEnabled)throw new Error('영상 업로드는 현재 출시 빌드에서 사용할 수 없어요. 사진으로 바꿔 주세요.');
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
    const upload=await cloud!.storage.from(PRIVATE_MEDIA_BUCKET).upload(path,content,{contentType:file.type || (kind==='video'?'video/mp4':'image/jpeg'),upsert:false});
    if(upload.error)throw upload.error;
    uploadedPaths.push(path);
    return {uri:`${MEDIA_REFERENCE_PREFIX}${path}`};
  }
  try {
    // Device drafts stay private. Only explicitly published recipes enter the catalog.
    const next:Data={...state,cafe:state.cafe?{...state.cafe,id:session.user.id}:null,recipes:[]};
    for(const recipe of state.recipes){
      let photo=recipe.photo;
      if(photo){const uploaded=await uploadMedia(photo,recipe.photoStoragePath,recipe.photoStorageBucket,recipe.id,'cover','image');photo=uploaded.uri;}
      const steps=[];
      for(const step of recipe.steps){
        const uploaded=step.media?await uploadMedia(step.media.uri,step.media.storagePath,step.media.storageBucket,recipe.id,step.id,step.media.type):undefined;
        const media=step.media&&uploaded?{type:step.media.type,uri:uploaded.uri,duration:step.media.duration}:undefined;
        steps.push({...step,media});
      }
      const {photoStoragePath:ignoredPath,photoStorageBucket:ignoredBucket,...publicRecipe}=recipe;
      next.recipes.push({...publicRecipe,steps,photo,cafeId:session.user.id});
    }
    const {error}=await cloud.rpc('save_cafe_account',{next_state:next});
    if(error)throw error;
    await cleanupUnusedMedia(next,session).catch(()=>undefined);
    return {...next,recipes:await Promise.all(next.recipes.map(hydrateRecipeMedia))};
  } catch(error) {
    if(uploadedPaths.length)await cloud.storage.from(PRIVATE_MEDIA_BUCKET).remove(uploadedPaths).catch(()=>undefined);
    throw error;
  }
}
export async function cleanupUnusedMedia(state:Data,session:Session) {
  if(!cloud)return;
  const active=new Set<string>();
  for(const recipe of state.recipes){
    const cover=mediaLocation(recipe.photo,recipe.photoStoragePath,recipe.photoStorageBucket);
    if(cover)active.add(`${cover.bucket}:${cover.path}`);
    for(const step of recipe.steps){
      const location=step.media?mediaLocation(step.media.uri,step.media.storagePath,step.media.storageBucket):null;
      if(location)active.add(`${location.bucket}:${location.path}`);
    }
  }
  for(const bucket of [PRIVATE_MEDIA_BUCKET,LEGACY_MEDIA_BUCKET]){
    const obsolete:string[]=[];
    for(let offset=0;;offset+=100){
      const page=await cloud.storage.from(bucket).list(session.user.id,{limit:100,offset});
      if(page.error)throw page.error;
      for(const object of page.data??[]){
        const path=`${session.user.id}/${object.name}`;
        if(!active.has(`${bucket}:${path}`))obsolete.push(path);
      }
      if((page.data?.length??0)<100)break;
    }
    for(let index=0;index<obsolete.length;index+=100){
      const removal=await cloud.storage.from(bucket).remove(obsolete.slice(index,index+100));
      if(removal.error)throw removal.error;
    }
  }
}
export async function catalog():Promise<{cafes:Cafe[];recipes:Recipe[]}> {
  if(!cloud)return {cafes:[],recipes:[]};
  const {data,error}=await cloud.from('cafe_catalog').select('cafe,recipes');
  if(error)throw error;
  const recipes=await Promise.all((data??[]).flatMap(row=>row.recipes).map(normalizeRecipe).map(hydrateRecipeMedia));
  return {cafes:(data??[]).map(row=>row.cafe),recipes};
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
  if(hasAppleIdentity(session)){
    let credential:AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential=await AppleAuthentication.signInAsync({requestedScopes:[]});
    }catch(error){
      if(error instanceof Error&&'code' in error&&(error as Error&{code?:string}).code==='ERR_REQUEST_CANCELED')throw new Error('계정 삭제를 취소했어요. Apple 재인증을 완료해야 삭제할 수 있어요.');
      throw error;
    }
    if(!credential.authorizationCode)throw new Error('Apple 계정 해제에 필요한 인증 코드를 받지 못했어요.');
    const result=await cloud.functions.invoke('delete-account',{body:{appleAuthorizationCode:credential.authorizationCode},headers:{Authorization:`Bearer ${session.access_token}`}});
    if(result.error)throw new Error(`Apple 연결을 해제하지 못했어요: ${result.error.message}`);
    if(!result.data?.deleted)throw new Error(result.data?.error??'계정 삭제가 완료되지 않았어요.');
    await cloud.auth.signOut({scope:'local'});
    return;
  }
  const paths=await cloud.rpc('cafe_account_storage_paths');
  if(paths.error)throw paths.error;
  const objects=(paths.data??[]) as {bucket_id:string;name:string}[];
  for(const bucket of [PRIVATE_MEDIA_BUCKET,LEGACY_MEDIA_BUCKET]){
    const names=objects.filter(object=>object.bucket_id===bucket).map(object=>object.name);
    for(let index=0;index<names.length;index+=100){
      const removal=await cloud.storage.from(bucket).remove(names.slice(index,index+100));
      if(removal.error)throw removal.error;
    }
  }
  const result=await cloud.rpc('delete_cafe_account');
  if(result.error)throw result.error;
  await cloud.auth.signOut({scope:'local'});
}

export function onAppleCredentialRevoked(listener:()=>void) {
  if(!AppleAuthentication.addRevokeListener)return {remove:()=>undefined};
  return AppleAuthentication.addRevokeListener(listener);
}
