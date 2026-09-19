// @ts-nocheck -- Supabase Edge Functions run on Deno, outside the Expo TypeScript runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decodeJwt, importPKCS8, SignJWT } from 'npm:jose@6';

const jsonHeaders={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};

function response(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:jsonHeaders});
}

async function appleClientSecret(){
  const teamId=Deno.env.get('APPLE_TEAM_ID');
  const clientId=Deno.env.get('APPLE_CLIENT_ID');
  const keyId=Deno.env.get('APPLE_KEY_ID');
  const privateKey=Deno.env.get('APPLE_PRIVATE_KEY')?.replace(/\\n/g,'\n');
  if(!teamId||!clientId||!keyId||!privateKey)throw new Error('Apple token revocation secrets are not configured.');
  const key=await importPKCS8(privateKey,'ES256');
  const secret=await new SignJWT({})
    .setProtectedHeader({alg:'ES256',kid:keyId})
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
  return {clientId,secret};
}

async function exchangeAppleCode(code:string,clientId:string,clientSecret:string){
  const result=await fetch('https://appleid.apple.com/auth/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code'}),
  });
  const body=await result.json();
  if(!result.ok||body.error)throw new Error(`Apple authorization exchange failed: ${body.error_description??body.error??result.status}`);
  if(!body.refresh_token&&!body.access_token)throw new Error('Apple did not return a revocable token.');
  return body as {refresh_token?:string;access_token?:string;id_token?:string};
}

async function revokeAppleToken(token:string,hint:'refresh_token'|'access_token',clientId:string,clientSecret:string){
  const result=await fetch('https://appleid.apple.com/auth/revoke',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,token,token_type_hint:hint}),
  });
  if(!result.ok)throw new Error(`Apple token revocation failed: ${result.status}`);
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:jsonHeaders});
  if(req.method!=='POST')return response({error:'Method not allowed'},405);
  try {
    const auth=req.headers.get('Authorization');
    if(!auth?.startsWith('Bearer '))return response({error:'Authentication required'},401);
    const supabaseUrl=Deno.env.get('SUPABASE_URL')!;
    const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const userResult=await userClient.auth.getUser();
    const user=userResult.data.user;
    if(userResult.error||!user)return response({error:'Invalid or expired session'},401);

    const providers=user.app_metadata?.providers??[user.app_metadata?.provider].filter(Boolean);
    if(!providers.includes('apple'))return response({error:'This endpoint is only used for Apple-linked accounts.'},400);
    const payload=await req.json().catch(()=>({}));
    if(typeof payload.appleAuthorizationCode!=='string'||!payload.appleAuthorizationCode)return response({error:'Fresh Apple reauthentication is required.'},400);

    const {clientId,secret}=await appleClientSecret();
    const tokens=await exchangeAppleCode(payload.appleAuthorizationCode,clientId,secret);
    const appleIdentity=user.identities?.find(identity=>identity.provider==='apple');
    const expectedAppleSubject=appleIdentity?.identity_data?.sub??appleIdentity?.id;
    const returnedAppleSubject=tokens.id_token?decodeJwt(tokens.id_token).sub:undefined;
    if(!expectedAppleSubject||!returnedAppleSubject||returnedAppleSubject!==expectedAppleSubject)throw new Error('Apple identity does not match the signed-in account.');

    const storedPaths=await userClient.rpc('cafe_account_storage_paths');
    if(storedPaths.error)throw storedPaths.error;
    const names=(storedPaths.data??[]).map((row:{name:string})=>row.name);
    for(let index=0;index<names.length;index+=100){
      const removal=await admin.storage.from('recipe-images').remove(names.slice(index,index+100));
      if(removal.error)throw removal.error;
    }

    const token=tokens.refresh_token??tokens.access_token!;
    await revokeAppleToken(token,tokens.refresh_token?'refresh_token':'access_token',clientId,secret);
    const deleted=await admin.auth.admin.deleteUser(user.id);
    if(deleted.error)throw deleted.error;
    return response({deleted:true,removedStorageObjects:names.length});
  }catch(error){
    console.error('delete-account failed',error);
    return response({error:error instanceof Error?error.message:'Account deletion failed'},500);
  }
});
