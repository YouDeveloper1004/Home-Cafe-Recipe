import { createClient, Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { File } from 'expo-file-system';
import { Cafe, Data, emptyData, normalizeRecipe, Recipe } from './domain';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const cloud = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true,
    storage: {getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync},
  },
}) : null;
export async function login(provider: 'google'): Promise<Session | null> {
  if (!cloud) throw new Error('로그인 서버 설정이 필요합니다.');
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
  async function uploadMedia(uri:string, recipeId:string, label:string, kind:'image'|'video') {
    if(/^https?:\/\//.test(uri))return uri;
    const file=new File(uri);
    if(file.size>10*1024*1024)throw new Error('사진과 영상은 파일당 10MB 이하만 게시할 수 있어요.');
    const content=await file.arrayBuffer();
    const safe=`${recipeId}-${label}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g,'-');
    const path=`${session.user.id}/${safe}${file.extension || (kind==='video'?'.mp4':'.jpg')}`;
    const upload=await cloud!.storage.from('recipe-images').upload(path,content,{contentType:file.type || (kind==='video'?'video/mp4':'image/jpeg')});
    if(upload.error)throw upload.error;
    return cloud!.storage.from('recipe-images').getPublicUrl(path).data.publicUrl;
  }
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
  return next;
}
export async function catalog():Promise<{cafes:Cafe[];recipes:Recipe[]}> {
  if(!cloud)return {cafes:[],recipes:[]};
  const {data,error}=await cloud.from('cafe_catalog').select('cafe,recipes');
  if(error)throw error;
  return {cafes:(data??[]).map(row=>row.cafe),recipes:(data??[]).flatMap(row=>row.recipes).map(normalizeRecipe)};
}
export async function deleteAccount(session:Session) {
  if(!cloud)throw new Error('서버 연결이 없습니다.');
  while(true){
    const listing=await cloud.storage.from('recipe-images').list(session.user.id,{limit:100});
    if(listing.error)throw listing.error;
    if(!listing.data.length)break;
    const removal=await cloud.storage.from('recipe-images').remove(listing.data.map(file=>`${session.user.id}/${file.name}`));
    if(removal.error)throw removal.error;
  }
  const result=await cloud.rpc('delete_cafe_account');
  if(result.error)throw result.error;
  await cloud.auth.signOut({scope:'local'});
}
