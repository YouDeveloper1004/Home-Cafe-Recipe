import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useKeepAwake } from 'expo-keep-awake';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CreateCafeScreen, CreateRecipeScreen } from './creator';
import { back, Cafe, Data, emptyData, normalizeRecipe, Recipe, Route, sampleCafes, sampleRecipes, scaleRecipe, seconds, StepMedia } from './domain';
import { blockOwner, catalog, cloud, deleteAccount, loadAccount, loadBlockedOwnerIds, loadRecipeModerationStatuses, login, LoginProvider, ModerationStatus, onAppleCredentialRevoked, reportContent, ReportReason, saveAccount, unblockOwner } from './cloud';
import { COMMUNITY_GUIDELINES, isAtLeast14, OVERSEAS_TRANSFER_NOTICE, PRIVACY_POLICY, SUPPORT_EMAIL, SUPPORT_URL, TERMS_OF_SERVICE } from './legal';
import { loadOfficialSeedRecipes } from './seed-recipes';
import type { Session } from '@supabase/supabase-js';

const KEY = '@cafe/app/v2';
const appleLoginEnabled=process.env.EXPO_PUBLIC_APPLE_LOGIN_ENABLED==='true';
const seedContentEnabled=process.env.EXPO_PUBLIC_SEED_CONTENT_ENABLED==='true';
const localProfileEnabled=process.env.EXPO_PUBLIC_LOCAL_PROFILE_ENABLED==='true';
const paper = '#F7F1E8', orange = '#B8674B', ink = '#2B241F';
const sampleRecipeImages: Record<string, number> = {
  'sample-v60': require('./assets/samples/v60-peach.png'),
  'sample-aero': require('./assets/samples/aeropress-morning.png'),
};
const sampleBeanImage = require('./assets/samples/coffee-beans.png');
function recipeImage(recipe: Recipe) { return recipe.photo ? {uri:recipe.photo} : sampleRecipeImages[recipe.id]; }
function Button({title,onPress,quiet=false,disabled=false}: {title:string;onPress:()=>void;quiet?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,quiet&&s.quiet,disabled&&{opacity:0.4}]}><Text style={[s.buttonText,quiet&&{color:ink}]}>{title}</Text></Pressable>;
}
function Field({value,onChange,placeholder,multiline=false}: {value:string;onChange:(v:string)=>void;placeholder:string;multiline?:boolean}) {
  return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor="#91867D" value={value} onChangeText={onChange} multiline={multiline} style={[s.input,multiline&&{minHeight:95,textAlignVertical:'top'}]} />;
}
function Consent({checked,onPress,label}: {checked:boolean;onPress:()=>void;label:string}) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{checked}} onPress={onPress} style={s.consentRow}><Text style={s.checkbox}>{checked?'✓':' '}</Text><Text style={s.consentText}>{label}</Text></Pressable>;
}
function birthDateFrom(value:string) {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)return null;
  const [,year,month,day]=match.map(Number);
  const date=new Date(year,month-1,day,12);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}
function birthDateValue(date:Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function birthDateLabel(value:string) {
  const date=birthDateFrom(value);
  return date?`${date.getFullYear()}년 ${date.getMonth()+1}월 ${date.getDate()}일`:'생년월일 선택';
}
const WHEEL_ITEM_HEIGHT=44;
function WheelColumn({label,options,value,onChange}:{label:string;options:number[];value:number;onChange:(value:number)=>void}) {
  const selectedIndex=Math.max(0,options.indexOf(value));
  return <View style={s.wheelColumn}>
    <Text style={s.wheelLabel}>{label}</Text>
    <View style={s.wheelWindow}>
      <View pointerEvents="none" style={s.wheelSelection}/>
      <ScrollView
        key={`${label}-${value}-${options.length}`}
        accessibilityLabel={`${label} 선택`}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{x:0,y:selectedIndex*WHEEL_ITEM_HEIGHT}}
        contentContainerStyle={s.wheelContent}
        onMomentumScrollEnd={event=>{
          const index=Math.max(0,Math.min(options.length-1,Math.round(event.nativeEvent.contentOffset.y/WHEEL_ITEM_HEIGHT)));
          onChange(options[index]);
        }}>
        {options.map(option=><Pressable key={option} accessibilityRole="button" accessibilityLabel={`${option}${label}`} onPress={()=>onChange(option)} style={s.wheelItem}>
          <Text style={[s.wheelItemText,option===value&&s.wheelItemSelected]}>{option}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}
function BirthDateField({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const today=new Date();
  const latest=new Date(today.getFullYear()-14,today.getMonth(),today.getDate(),12);
  const initial=()=>birthDateFrom(value)??new Date(today.getFullYear()-20,today.getMonth(),today.getDate(),12);
  const starting=initial();
  const [visible,setVisible]=useState(false);
  const [draftYear,setDraftYear]=useState(starting.getFullYear());
  const [draftMonth,setDraftMonth]=useState(starting.getMonth()+1);
  const [draftDay,setDraftDay]=useState(starting.getDate());
  const years=Array.from({length:latest.getFullYear()-1899},(_,index)=>latest.getFullYear()-index);
  const months=Array.from({length:draftYear===latest.getFullYear()?latest.getMonth()+1:12},(_,index)=>index+1);
  const monthDays=new Date(draftYear,draftMonth,0).getDate();
  const dayLimit=draftYear===latest.getFullYear()&&draftMonth===latest.getMonth()+1?Math.min(monthDays,latest.getDate()):monthDays;
  const days=Array.from({length:dayLimit},(_,index)=>index+1);
  const selectYear=(year:number)=>{
    const month=Math.min(draftMonth,year===latest.getFullYear()?latest.getMonth()+1:12);
    const maxDay=Math.min(new Date(year,month,0).getDate(),year===latest.getFullYear()&&month===latest.getMonth()+1?latest.getDate():31);
    setDraftYear(year);setDraftMonth(month);setDraftDay(Math.min(draftDay,maxDay));
  };
  const selectMonth=(month:number)=>{
    const maxDay=Math.min(new Date(draftYear,month,0).getDate(),draftYear===latest.getFullYear()&&month===latest.getMonth()+1?latest.getDate():31);
    setDraftMonth(month);setDraftDay(Math.min(draftDay,maxDay));
  };
  const open=()=>{
    const next=initial();
    setDraftYear(next.getFullYear());setDraftMonth(next.getMonth()+1);setDraftDay(next.getDate());setVisible(true);
  };
  return <View style={s.birthField}>
    <Text style={s.birthLabel}>생년월일 · 필수</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="생년월일 선택" onPress={open} style={s.birthButton}>
      <Text style={value?s.birthValue:s.birthPlaceholder}>{birthDateLabel(value)}</Text><Text style={s.birthIcon}>▿</Text>
    </Pressable>
    <Text style={s.small}>만 14세 이상 여부만 확인하며, 선택한 날짜는 서버에 저장하지 않아요.</Text>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>setVisible(false)}>
      <Pressable style={s.dateBackdrop} onPress={()=>setVisible(false)}>
        <Pressable style={s.dateSheet} onPress={event=>event.stopPropagation()}>
          <View style={s.dateSheetHeader}><Pressable onPress={()=>setVisible(false)}><Text style={s.dateCancel}>취소</Text></Pressable><Text style={s.dateTitle}>생년월일</Text><Pressable onPress={()=>{onChange(birthDateValue(new Date(draftYear,draftMonth-1,draftDay,12)));setVisible(false);}}><Text style={s.dateDone}>선택 완료</Text></Pressable></View>
          <Text style={s.dateSummary}>{draftYear}년 {draftMonth}월 {draftDay}일</Text>
          <View style={s.wheels}>
            <WheelColumn label="년" options={years} value={draftYear} onChange={selectYear}/>
            <WheelColumn label="월" options={months} value={draftMonth} onChange={selectMonth}/>
            <WheelColumn label="일" options={days} value={draftDay} onChange={setDraftDay}/>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}
function SearchField({initialValue,onChange}: {initialValue:string;onChange:(v:string)=>void}) {
  return <View style={s.searchField}><Text style={s.searchIcon}>⌕</Text><TextInput
    accessibilityLabel="Cafe, 제목, 추출 도구 검색"
    defaultValue={initialValue}
    onChangeText={onChange}
    placeholder="Cafe, 제목, 추출 도구 검색"
    placeholderTextColor="#91867D"
    keyboardType="default"
    textContentType="none"
    autoCapitalize="none"
    autoCorrect={false}
    returnKeyType="search"
    clearButtonMode="while-editing"
    style={s.searchInput}
  /></View>;
}
function Cup() { return <View style={s.cup}><Text style={{fontSize:70,color:paper}}>☕</Text></View>; }
function StepMediaView({media,compact=false}: {media:StepMedia;compact?:boolean}) {
  const player=useVideoPlayer(media.type==='video'?media.uri:null,p=>{p.loop=true;});
  if(media.type==='image')return <Image source={{uri:media.uri}} style={[s.stepMedia,compact&&s.stepMediaCompact]}/>;
  return <View style={[s.stepMediaFrame,compact&&s.stepMediaCompact]}><VideoView style={s.stepVideo} player={player} nativeControls contentFit="cover" fullscreenOptions={{enable:true}}/></View>;
}
function BrewControl({title,onPress,primary=false,disabled=false}: {title:string;onPress:()=>void;primary?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.brewControl,primary&&s.brewControlPrimary,disabled&&s.disabled]}>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} style={[s.brewControlText,primary&&s.brewControlTextPrimary]}>{title}</Text>
  </Pressable>;
}
function Brew({recipe,onExit,onDone}: {recipe:Recipe;onExit:()=>void;onDone:()=>void}) {
  useKeepAwake();
  const [index,setIndex]=useState(0), [paused,setPaused]=useState(false);
  const [remaining,setRemaining]=useState(0);
  const deadline=useRef<number|null>(null), lockedUntil=useRef(0), finished=useRef(false);
  const advancedStep=useRef(-1);
  const step=recipe.steps[index];
  const advance=()=>{
    if(finished.current||advancedStep.current===index) return;
    advancedStep.current=index;
    if(index===recipe.steps.length-1) {finished.current=true;onDone();}
    else setIndex(i=>i+1);
    Vibration.vibrate(45);
  };
  useEffect(()=>{
    advancedStep.current=-1;
    const duration=step.type==='timer'?seconds(step.value)*1000:0;
    deadline.current=duration?Date.now()+duration:null;
    setRemaining(duration);setPaused(false);lockedUntil.current=Date.now()+500;
  },[index]);
  useEffect(()=>{
    if(step.type!=='timer'||paused) return;
    const tick=()=>{
      if(deadline.current===null || AppState.currentState!=='active') return;
      const left=Math.max(0,deadline.current-Date.now());setRemaining(left);
      if(left===0) {deadline.current=null;advance();}
    };
    const timer=setInterval(tick,100);
    const listener=AppState.addEventListener('change',state=>{if(state==='active') tick();});
    return ()=>{clearInterval(timer);listener.remove();};
  },[index,paused]);
  const toggle=()=>{
    if(paused){deadline.current=Date.now()+remaining;setPaused(false);}
    else {setRemaining(Math.max(0,(deadline.current??Date.now())-Date.now()));deadline.current=null;setPaused(true);}
  };
  const left=Math.ceil(remaining/1000);
  return <View style={s.brewScreen}>
    <View style={s.brewHeader}><Button quiet title="닫기" onPress={()=>Alert.alert('추출을 종료할까요?','현재 진행은 저장되지 않아요.',[{text:'계속',style:'cancel'},{text:'종료',onPress:onExit}])}/><Text numberOfLines={1} ellipsizeMode="tail" style={s.brewRecipeTitle}>{recipe.title}</Text></View>
    <View style={s.track}><View style={{height:4,width:`${(index+1)/recipe.steps.length*100}%`,backgroundColor:orange}}/></View>
    <Pressable testID="brew-next" style={s.brew} onPress={()=>{if(step.type==='action'&&Date.now()>=lockedUntil.current){lockedUntil.current=Date.now()+500;advance();}}}>
      <Text style={s.eyebrow}>{index+1} / {recipe.steps.length} · {step.type==='timer'?'자동 대기':'수행 단계'}</Text>
      {step.media&&<StepMediaView key={step.media.uri} media={step.media} compact/>}
      <Text style={s.amount}>{step.type==='timer'?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:step.value||'✓'}</Text>
      <Text style={s.brewStepTitle}>{step.title}</Text>
      <Text style={s.brewHint}>{step.type==='timer'?'타이머가 끝나면 자동으로 넘어가요':'완료하면 화면을 탭하세요'}</Text>
    </Pressable>
    <View style={s.brewActions}>
      <BrewControl title="이전 단계" disabled={index===0} onPress={()=>setIndex(i=>Math.max(0,i-1))}/>
      {step.type==='timer'&&<><BrewControl title={paused?'계속':'일시정지'} onPress={toggle}/><BrewControl title="+10초" onPress={()=>{if(deadline.current!==null)deadline.current+=10000;setRemaining(x=>x+10000);}}/><BrewControl primary title="건너뛰기" onPress={advance}/></>}
    </View>
  </View>;
}

function Application() {
  const [data,setData]=useState<Data>(emptyData), [loaded,setLoaded]=useState(false), [loadError,setLoadError]=useState('');
  const [session,setSession]=useState<Session|null>(null), [authBusy,setAuthBusy]=useState(false);
  const [legalGate,setLegalGate]=useState(false);
  const [remote,setRemote]=useState<{cafes:Cafe[];recipes:Recipe[]}>({cafes:[],recipes:[]});
  const [blockedOwners,setBlockedOwners]=useState<string[]>([]);
  const [moderation,setModeration]=useState<Record<string,ModerationStatus>>({});
  const dataRef=useRef(data), saving=useRef(false);
  const [stack,setStack]=useState<Route[]>([{screen:'home'}]);
  const route=stack[stack.length-1];
  const [query,setQuery]=useState(''), [filter,setFilter]=useState('전체'), [name,setName]=useState('');
  const [rating,setRating]=useState(5), [note,setNote]=useState('');
  const [cafeTab,setCafeTab]=useState('레시피'), [latest,setLatest]=useState(true);
  const [cupSelection,setCupSelection]=useState<{recipeId:string;volumeMl:number}|null>(null);
  const [termsAccepted,setTermsAccepted]=useState(false), [privacyAccepted,setPrivacyAccepted]=useState(false);
  const [overseasAccepted,setOverseasAccepted]=useState(false), [birthDate,setBirthDate]=useState('');
  const allRecipes=[...data.recipes,...remote.recipes.filter(r=>r.cafeId!==data.cafe?.id),...sampleRecipes];
  const allCafes=[...sampleCafes,...remote.cafes.filter(c=>c.id!==data.cafe?.id),...(data.cafe?[data.cafe]:[])];
  const recipes=allRecipes.filter(r=>!r.cafeId||!blockedOwners.includes(r.cafeId));
  const cafes=allCafes.filter(c=>!blockedOwners.includes(c.id));
  const recipe=recipes.find(r=>r.id===route.id), cafe=cafes.find(c=>c.id===route.id);
  const owner=(r:Recipe)=>cafes.find(c=>c.id===r.cafeId)??data.cafe??sampleCafes[0];
  const selectedVolume=(r:Recipe)=>cupSelection?.recipeId===r.id?cupSelection.volumeMl:r.baseVolumeMl;
  const reset=(screen:Route['screen'])=>setStack([{screen}]);
  const go=(screen:Route['screen'],id?:string)=>setStack(current=>[...current,{screen,id}]);
  const pop=()=>setStack(current=>back(current));
  useEffect(()=>{
    (async()=>{
      try {
        const stored=await AsyncStorage.getItem(KEY);
        let next:Data;
        if(stored) {
          next={...emptyData,...JSON.parse(stored)};
          if(!Array.isArray(next.recipes)||!Array.isArray(next.reviews)||!Array.isArray(next.saved)||!Array.isArray(next.following)) throw new Error('invalid');
          next={...next,recipes:next.recipes.map(normalizeRecipe),draft:next.draft?normalizeRecipe(next.draft):null};
        } else {
          const legacy=await AsyncStorage.getItem('@cafe/creator-data/v1');
          const old=legacy?JSON.parse(legacy):{};
          next={...emptyData,cafe:old.cafe??null,recipes:(old.recipes??[]).map((r:Recipe)=>normalizeRecipe({...r,cafeId:old.cafe?.id})),name:old.cafe?'내 프로필':'',active:!!old.cafe};
        }
        if(cloud) {
          const restored=await cloud.auth.getSession();
          if(restored.error)throw restored.error;
          if(restored.data.session){
            next=await loadAccount(restored.data.session);setSession(restored.data.session);
            setBlockedOwners(await loadBlockedOwnerIds());setModeration(await loadRecipeModerationStatuses());
            setLegalGate(!next.termsAcceptedAt||!next.privacyAcceptedAt||!next.overseasTransferAcceptedAt||!next.ageConfirmedAt);
          }
          setRemote(await catalog());
        }
        dataRef.current=next;setData(next);setName(next.name);setLoaded(true);
      }catch {setLoadError('저장된 데이터를 불러오지 못했습니다. 앱을 다시 열어 주세요. 기존 데이터는 유지됩니다.');}
    })();
  },[]);
  useEffect(()=>{
    if(!cloud)return;
    const client=cloud;
    const listener=AppState.addEventListener('change',state=>{if(state==='active')client.auth.startAutoRefresh();else client.auth.stopAutoRefresh();});
    cloud.auth.startAutoRefresh();
    return ()=>{listener.remove();client.auth.stopAutoRefresh();};
  },[]);
  useEffect(()=>{
    if(Platform.OS!=='ios'||!cloud)return;
    const client=cloud;
    const subscription=onAppleCredentialRevoked(()=>{void (async()=>{
      await client.auth.signOut({scope:'local'}).catch(()=>undefined);
      const stored=await AsyncStorage.getItem(KEY);
      const local:Data=stored?{...emptyData,...JSON.parse(stored)}:emptyData;
      const next:Data={...local,recipes:(local.recipes??[]).map(normalizeRecipe),draft:local.draft?normalizeRecipe(local.draft):null};
      setSession(null);setBlockedOwners([]);setModeration({});setLegalGate(false);dataRef.current=next;setData(next);setName(next.name);reset('home');
      Alert.alert('Apple 연결이 해제됐어요','계정을 보호하기 위해 로그아웃했습니다.');
    })();});
    return ()=>subscription.remove();
  },[]);
  function consentStamp(online:boolean) {
    const alreadyAccepted=data.termsAcceptedAt&&data.privacyAcceptedAt&&data.ageConfirmedAt&&(!online||data.overseasTransferAcceptedAt);
    if(alreadyAccepted)return {legalAcceptedAt:data.legalAcceptedAt??data.termsAcceptedAt,termsAcceptedAt:data.termsAcceptedAt,privacyAcceptedAt:data.privacyAcceptedAt,overseasTransferAcceptedAt:data.overseasTransferAcceptedAt,ageConfirmedAt:data.ageConfirmedAt};
    if(!termsAccepted||!privacyAccepted){Alert.alert('필수 동의가 필요해요','이용약관과 개인정보처리방침을 각각 확인하고 동의해 주세요.');return null;}
    if(online&&!overseasAccepted){Alert.alert('국외 이전 확인이 필요해요','온라인 계정은 Supabase 미국 리전에 저장됩니다. 동의하지 않으면 로컬 체험을 이용할 수 있어요.');return null;}
    if(!isAtLeast14(birthDate)){Alert.alert('가입할 수 없어요','생년월일을 선택해 주세요. Bean Chillin는 만 14세 이상만 가입할 수 있어요.');return null;}
    const now=new Date().toISOString();return {legalAcceptedAt:now,termsAcceptedAt:now,privacyAcceptedAt:now,overseasTransferAcceptedAt:online?now:'',ageConfirmedAt:now};
  }
  async function signIn(provider:LoginProvider) {
    const consent=consentStamp(true);if(!consent)return;
    if(authBusy)return;setAuthBusy(true);
    try {
      const logged=await login(provider);if(!logged)return;
      let next=await loadAccount(logged);
      if(!next.termsAcceptedAt||!next.privacyAcceptedAt||!next.overseasTransferAcceptedAt||!next.ageConfirmedAt)next=await saveAccount({...next,...consent},logged);
      const feed=await catalog();const blocks=await loadBlockedOwnerIds();const statuses=await loadRecipeModerationStatuses();
      setSession(logged);setBlockedOwners(blocks);setModeration(statuses);dataRef.current=next;setData(next);setName(next.name);setRemote(feed);reset('profile');
      setLegalGate(false);
    }catch(e){await cloud?.auth.signOut();Alert.alert('로그인하지 못했어요',e instanceof Error?e.message:'인증 설정을 확인해 주세요.');}
    finally{setAuthBusy(false);}
  }
  async function signOut() {
    if(saving.current||authBusy)return;
    if(session) {
      const result=await cloud?.auth.signOut();if(result?.error){Alert.alert('로그아웃 실패',result.error.message);return;}
      setSession(null);
      setBlockedOwners([]);
      setModeration({});
      setLegalGate(false);
      const stored=await AsyncStorage.getItem(KEY);
      const restored:Data=stored?{...emptyData,...JSON.parse(stored)}:emptyData;
      const next:Data={...restored,recipes:restored.recipes.map(normalizeRecipe),draft:restored.draft?normalizeRecipe(restored.draft):null};
      dataRef.current=next;setData(next);setName(next.name);reset('home');
    }else if(await commit(d=>({...d,active:false})))reset('home');
  }
  function removeCloudAccount() {
    Alert.alert('계정을 삭제할까요?','계정, 공개 Cafe, 레시피, 사진, 개인 기록이 서버에서 영구 삭제됩니다.',[
      {text:'취소',style:'cancel'},
      {text:'계정 삭제',style:'destructive',onPress:async()=>{
        if(!session||authBusy||saving.current)return;setAuthBusy(true);
        try {await deleteAccount(session);await AsyncStorage.removeItem(KEY);setSession(null);setBlockedOwners([]);setModeration({});setLegalGate(false);setRemote(await catalog());dataRef.current=emptyData;setData(emptyData);setName('');setTermsAccepted(false);setPrivacyAccepted(false);setOverseasAccepted(false);setBirthDate('');reset('profile');}
        catch(e){Alert.alert('삭제를 완료하지 못했어요',e instanceof Error?e.message:'다시 시도해 주세요.');}
        finally{setAuthBusy(false);}
      }},
    ]);
  }
  useEffect(()=>{
    const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(stack.length<2)return false;
      if(route.screen==='editor') Alert.alert('작성을 닫을까요?','저장하지 않은 변경은 사라집니다.',[{text:'취소',style:'cancel'},{text:'닫기',onPress:pop}]);
      else if(route.screen==='brew') Alert.alert('추출을 종료할까요?','현재 진행은 저장되지 않아요.',[{text:'계속',style:'cancel'},{text:'종료',onPress:pop}]);
      else pop();
      return true;
    });return ()=>handler.remove();
  },[stack]);
  async function commit(update:(old:Data)=>Data):Promise<boolean> {
    if(saving.current||!loaded)return false;
    saving.current=true;
    try {let next=update(dataRef.current);if(session){next=await saveAccount(next,session);setModeration(await loadRecipeModerationStatuses());}else await AsyncStorage.setItem(KEY,JSON.stringify(next));dataRef.current=next;setData(next);return true;}
    catch(e) {Alert.alert('저장하지 못했어요',session && e instanceof Error ? e.message : '입력 내용은 화면에 남아 있어요. 다시 시도해 주세요.');return false;}
    finally {saving.current=false;}
  }
  async function addOfficialSeedContent() {
    if(!session||!data.cafe)return;
    try {
      const seeds=await loadOfficialSeedRecipes(data.cafe.id);
      const additions=seeds.filter(seed=>!data.recipes.some(recipe=>recipe.id===seed.id));
      if(!additions.length){Alert.alert('이미 등록되어 있어요','초기 공식 레시피 10개가 모두 이 Cafe에 있습니다.');return;}
      if(await commit(current=>({...current,recipes:[...additions,...current.recipes]}))) {
        Alert.alert('공식 레시피를 등록했어요',`${additions.length}개 레시피와 표지 이미지를 저장했습니다. 검토 승인 후 다른 사용자에게 공개됩니다.`);
      }
    } catch(error) {
      Alert.alert('초기 레시피를 등록하지 못했어요',error instanceof Error?error.message:'다시 시도해 주세요.');
    }
  }
  function requireAccount(action:()=>void) {if(data.active)action();else {reset('profile');Alert.alert('내 프로필을 먼저 만들어 주세요','이 기기에서 사용할 이름을 입력하면 Cafe를 만들고 레시피를 저장할 수 있어요.');}}
  const create=()=>requireAccount(()=>go(data.cafe?'editor':'createCafe'));
  const toggle=(key:'saved'|'following',id:string)=>requireAccount(()=>{void commit(d=>({...d,[key]:d[key].includes(id)?d[key].filter(x=>x!==id):[...d[key],id]}));});
  const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  function submitReport(targetType:'cafe'|'recipe',targetId:string) {
    if(!session){Alert.alert('로그인이 필요해요','신고하려면 Google 또는 Apple 계정으로 로그인해 주세요.');return;}
    const reasons:ReportReason[]=['스팸','부적절한 콘텐츠','저작권 침해','기타'];
    Alert.alert('신고 사유를 선택해 주세요','신고 내용은 다른 사용자에게 공개되지 않습니다.',[
      ...reasons.map(reason=>({text:reason,onPress:()=>void reportContent(targetType,targetId,reason).then(()=>Alert.alert('신고를 접수했어요','검토 후 필요한 조치를 진행합니다.')).catch(e=>Alert.alert('신고하지 못했어요',e instanceof Error?e.message:'다시 시도해 주세요.'))})),
      {text:'취소',style:'cancel' as const},
    ]);
  }
  function blockCafe(ownerId:string) {
    if(!session){Alert.alert('로그인이 필요해요','Cafe를 차단하려면 로그인해 주세요.');return;}
    Alert.alert('이 Cafe를 차단할까요?','홈과 탐색에서 이 Cafe의 레시피가 보이지 않습니다.',[{text:'취소',style:'cancel'},{text:'차단',style:'destructive',onPress:()=>void blockOwner(ownerId).then(()=>{setBlockedOwners(ids=>ids.includes(ownerId)?ids:[...ids,ownerId]);reset('home');}).catch(e=>Alert.alert('차단하지 못했어요',e instanceof Error?e.message:'다시 시도해 주세요.'))}]);
  }
  const localRegistrationReady=Boolean((data.termsAcceptedAt&&data.privacyAcceptedAt&&data.ageConfirmedAt)||(termsAccepted&&privacyAccepted&&isAtLeast14(birthDate)));
  const onlineRegistrationReady=Boolean((data.termsAcceptedAt&&data.privacyAcceptedAt&&data.overseasTransferAcceptedAt&&data.ageConfirmedAt)||(localRegistrationReady&&overseasAccepted));
  async function startLocalProfile() {
    const consent=consentStamp(false);if(!consent)return;
    await commit(d=>({...d,...consent,name:name.trim().slice(0,40),active:true}));
  }
  async function acceptExistingAccount() {
    const consent=consentStamp(true);if(!consent||!session)return;
    setAuthBusy(true);
    try {const next=await saveAccount({...dataRef.current,...consent},session);dataRef.current=next;setData(next);setLegalGate(false);reset('profile');}
    catch(e){Alert.alert('동의를 저장하지 못했어요',e instanceof Error?e.message:'다시 시도해 주세요.');}
    finally{setAuthBusy(false);}
  }
  const registrationFields=<>
    <BirthDateField value={birthDate} onChange={setBirthDate}/>
    {!!birthDate&&!isAtLeast14(birthDate)&&<Text style={s.validation}>만 14세 이상만 가입할 수 있습니다.</Text>}
    <Consent checked={termsAccepted} onPress={()=>setTermsAccepted(value=>!value)} label="이용약관에 동의합니다 (필수)"/>
    <Consent checked={privacyAccepted} onPress={()=>setPrivacyAccepted(value=>!value)} label="개인정보 수집·이용에 동의합니다 (필수)"/>
    {cloud&&<Consent checked={overseasAccepted} onPress={()=>setOverseasAccepted(value=>!value)} label="Supabase 미국 리전으로의 개인정보 국외 이전에 동의합니다 (온라인 기능 필수)"/>}
    <View style={s.row}><Button quiet title="이용약관" onPress={()=>go('legal','terms')}/><Button quiet title="개인정보처리방침" onPress={()=>go('legal','privacy')}/><Button quiet title="국외 이전 안내" onPress={()=>go('legal','overseas')}/><Button quiet title="커뮤니티 운영정책" onPress={()=>go('legal','community')}/></View>
  </>;
  function openCafe(id:string) {setCafeTab('레시피');setStack(current=>{const base=current.at(-1)?.screen==='detail'?current.slice(0,-1):current;return base.at(-1)?.screen==='cafe'&&base.at(-1)?.id===id?base:[...base,{screen:'cafe',id}];});}
  function cards(items:Recipe[]) {return items.length?items.map(r=><Pressable accessibilityRole="button" key={r.id} style={s.card} onPress={()=>go('detail',r.id)}>
    {recipeImage(r)?<Image source={recipeImage(r)} style={s.thumb}/>:<View style={[s.thumb,{backgroundColor:owner(r).color}]}><Text style={s.white}>{r.equipment}</Text></View>}
    <View style={{flex:1}}><Text style={s.eyebrow}>{owner(r).name}</Text><Text style={s.cardTitle}>{r.title}</Text>{session&&r.cafeId===data.cafe?.id&&moderation[r.id]&&<Text style={s.moderation}>{moderation[r.id].status==='approved'?'게시됨':moderation[r.id].status==='rejected'?`반려됨${moderation[r.id].reviewNote?` · ${moderation[r.id].reviewNote}`:' · 수정 후 다시 제출'}`:'검토 중 · 승인 후 공개'}</Text>}<Text style={s.small}>{r.bean?.product ? `${r.bean.product} · ` : ''}{r.beans} · {r.duration} · {r.steps.length}단계</Text></View><Text>›</Text>
  </Pressable>):<Text style={s.empty}>아직 레시피가 없어요.</Text>;}
  const header=(title:string)=><View style={s.row}><Button title="‹ 뒤로" quiet onPress={pop}/><Text style={s.heading}>{title}</Text></View>;
  const legalTitle=route.id==='terms'?'이용약관':route.id==='overseas'?'개인정보 국외 이전':route.id==='community'?'커뮤니티 운영정책':'개인정보처리방침';
  const legalBody=route.id==='terms'?TERMS_OF_SERVICE:route.id==='overseas'?OVERSEAS_TRANSFER_NOTICE:route.id==='community'?COMMUNITY_GUIDELINES:PRIVACY_POLICY;
  const confirmDiscard=()=>Alert.alert('작성을 닫을까요?','저장하지 않은 변경은 사라집니다. 초안 저장으로 이어서 작성할 수 있어요.',[{text:'계속 작성',style:'cancel'},{text:'닫기',onPress:pop}]);
  if(loadError) return <View style={s.body}><Text>{loadError}</Text></View>;
  if(!loaded)return <View style={s.body}><Text>내 Cafe를 불러오는 중…</Text></View>;
  if(legalGate)return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>{route.screen==='legal'?<>{header(legalTitle)}<Text style={s.legalBody}>{legalBody}</Text></>:<><Text style={s.title}>계속 이용하기 전에 확인해 주세요</Text><Text style={s.muted}>만 14세 이상 확인과 각 필수 항목에 대한 개별 동의가 필요합니다.</Text>{registrationFields}<Button title="동의하고 계속" disabled={!onlineRegistrationReady||authBusy} onPress={()=>void acceptExistingAccount()}/><Button quiet title="로그아웃" onPress={()=>void signOut()}/></>}</ScrollView></KeyboardAvoidingView>;
  if(route.screen==='createCafe')return <CreateCafeScreen initial={data.cafe??undefined} onBack={confirmDiscard} onSave={async c=>{
    if(sampleCafes.some(x=>x.handle===c.handle)){Alert.alert('사용 중인 핸들이에요','다른 핸들을 선택해 주세요.');return;}
    if(await commit(d=>({...d,cafe:c})))reset('profile');
  }}/>;
  if(route.screen==='editor'&&data.cafe)return <CreateRecipeScreen online={!!session} key={route.id??'new'} cafe={data.cafe} initial={route.id==='draft'?data.draft??undefined:data.recipes.find(r=>r.id===route.id)} onBack={confirmDiscard}
    onDraft={async r=>{if(await commit(d=>({...d,draft:r})))reset('profile');}}
    onPublish={async r=>{const published={...r,cafeId:data.cafe!.id};if(await commit(d=>({...d,recipes:[published,...d.recipes.filter(x=>x.id!==r.id)],draft:d.draft?.id===r.id?null:d.draft}))) {reset('profile');Alert.alert('레시피를 저장했어요',session?'검토가 끝나면 다른 이용자의 피드에 공개됩니다. 내 Cafe에서는 검토 상태를 확인할 수 있어요.':'내 Cafe에서 확인하고 따라 내릴 수 있어요.');}}}/>;
  if(route.screen==='brew'&&recipe)return <Brew recipe={recipe} onExit={pop} onDone={()=>{setRating(5);setNote('');setStack(current=>[...current.slice(0,-1),{screen:'review',id:recipe.id}]);}}/>;
  const tab=['home','search','saved','profile'].includes(route.screen);
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      {route.screen==='settings'&&session&&<Button quiet title="온라인 계정 삭제" disabled={authBusy} onPress={removeCloudAccount}/>}
      {route.screen==='legal'&&<>{header(legalTitle)}<Text style={s.legalBody}>{legalBody}</Text></>}
      {route.screen==='home'&&<>
        <View style={s.row}><View><Text style={s.brandEyebrow}>CAFE NOTE</Text><Text style={s.brand}>오늘의 커피</Text><Text style={s.muted}>천천히 고르고, 함께 내려요</Text></View><Pressable style={s.textAction} onPress={()=>reset('profile')}><Text style={s.textActionLabel}>내 Cafe →</Text></Pressable></View>
        <Pressable style={s.searchPrompt} onPress={()=>reset('search')}><Text style={s.searchPromptIcon}>⌕</Text><Text style={s.searchPromptText}>Cafe, 원두, 레시피를 찾아보세요</Text></Pressable>
        {cloud&&<Pressable style={s.refreshLink} onPress={()=>{void catalog().then(setRemote).catch(()=>Alert.alert('피드를 불러오지 못했어요','네트워크 상태를 확인해 주세요.'));}}><Text style={s.refreshLinkText}>피드 새로고침 ↻</Text></Pressable>}
        <Pressable style={s.featured} onPress={()=>go('detail',recipes[0].id)}>
          {recipeImage(recipes[0])?<Image source={recipeImage(recipes[0])} style={s.featuredImage}/>:<View style={[s.featuredImage,{backgroundColor:owner(recipes[0]).color}]}/>} 
          <View style={s.featuredShade}/><View style={s.featuredCopy}><Text style={s.featuredEyebrow}>오늘의 레시피</Text><Text style={s.heroTitle}>{recipes[0].title}</Text><Text style={s.white}>레시피 보기 →</Text></View>
        </Pressable>
        <Text style={s.heading}>발견하는 Cafe</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{cafes.map(c=><Pressable key={c.id} style={s.cafeChip} onPress={()=>openCafe(c.id)}><View style={[s.logo,{backgroundColor:c.color}]}><Text style={s.white}>{c.name.slice(0,1)}</Text></View><Text numberOfLines={2} style={s.cafeName}>{c.name}</Text></Pressable>)}</ScrollView>
        <View style={s.row}><Button title="전체 레시피" quiet={filter!=='전체'} onPress={()=>setFilter('전체')}/><Button title="팔로우한 Cafe" quiet={filter==='전체'} onPress={()=>setFilter('팔로우')}/></View>
        {cards(filter==='전체'?recipes:recipes.filter(r=>data.following.includes(owner(r).id)))}
      </>}
      {route.screen==='search'&&<><Text style={s.title}>새로운 한 잔 발견하기</Text><SearchField initialValue={query} onChange={setQuery}/><Text style={s.heading}>Cafe</Text>{cafes.filter(c=>(c.name+' '+c.handle).toLowerCase().includes(query.toLowerCase())).map(c=><Button quiet key={c.id} title={c.name+' →'} onPress={()=>openCafe(c.id)}/>)}<Text style={s.heading}>레시피</Text>{cards(recipes.filter(r=>(r.title+' '+r.description+' '+r.equipment+' '+(r.bean?.product??'')+' '+owner(r).name).toLowerCase().includes(query.toLowerCase())))}</>}
      {route.screen==='saved'&&<><Text style={s.title}>다시 내리고 싶은 커피</Text>{cards(recipes.filter(r=>data.saved.includes(r.id)))}</>}
      {route.screen==='profile'&&<>
        <View style={s.row}><Text style={s.title}>내 Cafe</Text><Button quiet title="설정" onPress={()=>go('settings')}/></View>
        {!data.active?<><Text style={s.heading}>나만의 커피 기록을 시작해요</Text><Text style={s.muted}>만 14세 이상만 가입할 수 있으며, 시작하기 전에 필수 항목을 확인해 주세요.</Text>{registrationFields}{cloud&&appleLoginEnabled&&Platform.OS==='ios'&&<AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={8} style={[s.appleButton,(!onlineRegistrationReady||authBusy)&&s.disabled]} onPress={()=>{if(onlineRegistrationReady&&!authBusy)void signIn('apple');}}/>}{cloud&&<Button title="Google로 계속하기" disabled={!onlineRegistrationReady||authBusy} onPress={()=>void signIn('google')}/>} {localProfileEnabled&&<><Field value={name} onChange={setName} placeholder="사용할 이름"/><Button title="로컬 프로필로 시작" disabled={!name.trim()||!localRegistrationReady||authBusy} onPress={()=>void startLocalProfile()}/><Text style={s.small}>국외 이전에 동의하지 않아도 로컬 체험은 이용할 수 있습니다. 로컬 데이터는 이 기기에만 저장됩니다.</Text></>}</>:<><Text style={s.heading}>{data.name}님의 커피 공간</Text><Text style={s.small}>{session?'계정에 연결됨 · 온라인 저장':'로컬 프로필 · 이 기기에 저장'}</Text>
          {data.cafe?<><Pressable style={[s.hero,{backgroundColor:data.cafe.color}]} onPress={()=>openCafe(data.cafe!.id)}><Text style={s.heroTitle}>{data.cafe.name}</Text><Text style={s.white}>@{data.cafe.handle}</Text><Text style={s.white}>{data.cafe.bio}</Text><Text style={s.white}>레시피 {data.recipes.length} · Cafe 열기 →</Text></Pressable><View style={s.row}><Button quiet title="Cafe 수정" onPress={()=>go('createCafe')}/><Button title="＋ 새 레시피" onPress={create}/></View>{seedContentEnabled&&session&&<Button quiet title="공식 초기 레시피 10개 등록" onPress={()=>void addOfficialSeedContent()}/>} {data.draft&&<Button quiet title={`초안 이어 쓰기 · ${data.draft.title||'제목 없음'}`} onPress={()=>go('editor','draft')}/>}<Text style={s.heading}>내가 올린 레시피</Text>{cards(data.recipes)}</>:<Button title="Cafe 만들기" onPress={create}/>}</>}
        <Text style={s.heading}>내 추출 기록</Text>{data.reviews.length?data.reviews.map(review=><View key={review.id} style={s.panel}><Text style={s.cardTitle}>{review.title}</Text><Text>{'★'.repeat(review.rating)} · {new Date(review.date).toLocaleDateString()}</Text><Text style={s.muted}>{review.note||'맛 메모 없음'}</Text></View>):<Text style={s.empty}>커피를 내리고 첫 맛 기록을 남겨 보세요.</Text>}
      </>}
      {route.screen==='cafe'&&cafe&&<>{header('Cafe')}<View style={[s.hero,{backgroundColor:cafe.color}]}><Text style={s.heroTitle}>{cafe.name}</Text><Text style={s.white}>@{cafe.handle}</Text><Text style={s.white}>{recipes.filter(r=>owner(r).id===cafe.id).length}개 레시피</Text></View><Button title={data.following.includes(cafe.id)?'팔로우 중 ✓':'팔로우'} onPress={()=>toggle('following',cafe.id)}/>{data.cafe?.id!==cafe.id&&uuid(cafe.id)&&<View style={s.row}><Button quiet title="Cafe 신고하기" onPress={()=>submitReport('cafe',cafe.id)}/><Button quiet title="Cafe 차단하기" onPress={()=>blockCafe(cafe.id)}/></View>}<View style={s.row}><Button quiet={cafeTab!=='레시피'} title="레시피" onPress={()=>setCafeTab('레시피')}/><Button quiet={cafeTab!=='소개'} title="소개" onPress={()=>setCafeTab('소개')}/></View>{cafeTab==='소개'?<Text style={s.muted}>{cafe.bio}</Text>:<><Button quiet title={latest?'최신순 ↓':'오래된 순 ↑'} onPress={()=>setLatest(x=>!x)}/>{cards(recipes.filter(r=>owner(r).id===cafe.id).sort((a,b)=>(latest?1:-1)*b.publishedAt.localeCompare(a.publishedAt)))}</>}</>}
      {route.screen==='detail'&&recipe&&<>{header('레시피')}{recipeImage(recipe)?<Image source={recipeImage(recipe)} style={s.cover}/>:<View style={[s.hero,{backgroundColor:owner(recipe).color}]}><Cup/></View>}
        <Pressable style={s.panel} onPress={()=>openCafe(owner(recipe).id)}><Text style={s.heading}>{owner(recipe).name} ›</Text></Pressable><Text style={s.title}>{recipe.title}</Text><Text style={s.muted}>{recipe.description}</Text>
        {recipe.bean&&<View style={s.beanCard}><Image source={sampleBeanImage} style={s.beanImage}/><View style={s.beanCopy}><Text style={s.eyebrow}>CAFE 추천 원두</Text><Text style={s.cardTitle}>{recipe.bean.product}</Text><Text style={s.small}>{[recipe.bean.roaster,recipe.bean.origin,recipe.bean.process,recipe.bean.roast].filter(Boolean).join(' · ') || '이 레시피에 어울리는 원두'}</Text></View></View>}
        <View style={s.panel}><Text style={s.eyebrow}>컵 사이즈에 맞춰 보기</Text><View style={s.cupOptions}>{[recipe.baseVolumeMl,Math.round(recipe.baseVolumeMl*1.5)].map(volume=><Pressable key={volume} style={[s.cupOption,selectedVolume(recipe)===volume&&s.cupOptionActive]} onPress={()=>setCupSelection({recipeId:recipe.id,volumeMl:volume})}><Text style={[s.cupOptionText,selectedVolume(recipe)===volume&&s.cupOptionTextActive]}>{volume}ml{volume===recipe.baseVolumeMl?' · 기준':''}</Text></Pressable>)}</View><Text style={s.cardTitle}>{recipe.equipment} · 원두 {scaleRecipe(recipe,selectedVolume(recipe)).beansG}g</Text><Text style={s.muted}>물 {scaleRecipe(recipe,selectedVolume(recipe)).waterG}g · {recipe.temperature} · {recipe.duration}</Text></View>
        <View style={s.row}><Button quiet title={data.saved.includes(recipe.id)?'저장됨 ♥':'저장 ♡'} onPress={()=>toggle('saved',recipe.id)}/><Button quiet title="공유" onPress={()=>void Share.share({message:`${recipe.title}\n${recipe.description}\n${recipe.equipment} / ${recipe.bean?.product ? `추천 원두 ${recipe.bean.product} (${recipe.beans})` : `원두 ${recipe.beans}`} / 물 ${recipe.water} / ${recipe.temperature}\n${recipe.steps.map((x,i)=>`${i+1}. ${x.title} ${x.value}`).join('\n')}`}).catch(()=>Alert.alert('공유를 열 수 없어요'))}/>{data.cafe?.id!==owner(recipe).id&&uuid(owner(recipe).id)&&<Button quiet title="신고" onPress={()=>submitReport('recipe',recipe.id)}/>}</View>
        <Text style={s.heading}>추출 단계</Text>{recipe.steps.map((step,i)=><View style={s.panel} key={step.id}>{step.media&&<StepMediaView key={step.media.uri} media={step.media}/>}<Text style={s.cardTitle}>{i+1}. {step.title}</Text><Text style={s.small}>{step.type==='timer'?'자동 타이머':'완료 후 탭'} · {step.value}</Text></View>)}
        <Button title="따라 내리기 →" onPress={()=>go('brew',recipe.id)}/>
        {data.active&&data.recipes.some(r=>r.id===recipe.id)&&<View style={s.row}><Button quiet title="수정" onPress={()=>go('editor',recipe.id)}/><Button quiet title="삭제" onPress={()=>Alert.alert('레시피를 삭제할까요?','기기에 저장된 이 레시피가 삭제됩니다.',[{text:'취소',style:'cancel'},{text:'삭제',style:'destructive',onPress:async()=>{if(await commit(d=>({...d,recipes:d.recipes.filter(r=>r.id!==recipe.id),saved:d.saved.filter(id=>id!==recipe.id)})))pop();}}])}/></View>}
        <Text style={s.heading}>맛 기록</Text>{data.reviews.filter(x=>x.recipeId===recipe.id).map(x=><View style={s.panel} key={x.id}><Text>{'★'.repeat(x.rating)} · {x.note}</Text></View>)}
      </>}
      {route.screen==='review'&&recipe&&<><Text style={s.eyebrow}>BREW COMPLETE</Text><Cup/><Text style={s.title}>멋지게 내렸어요!</Text><Text style={s.muted}>{recipe.title} · 오늘의 한 잔은 어땠나요?</Text><View style={s.row}>{[1,2,3,4,5].map(n=><Pressable accessibilityLabel={`${n}점`} key={n} onPress={()=>setRating(n)}><Text style={{fontSize:38,color:n<=rating?orange:'#D9D0C8'}}>★</Text></Pressable>)}</View><Field value={note} onChange={setNote} placeholder="산미, 단맛, 다음번에 바꾸고 싶은 점" multiline/><Button title="맛 기록 저장" onPress={async()=>{if(await commit(d=>({...d,reviews:[{id:String(Date.now()),recipeId:recipe.id,title:recipe.title,rating,note,date:new Date().toISOString()},...d.reviews]})))reset('profile');}}/><Button quiet title="기록 없이 홈으로" onPress={()=>reset('home')}/></>}
      {route.screen==='settings'&&<>{header('계정 설정')}<Text style={s.muted}>{session?'온라인 계정에 연결되었습니다.':'로컬 프로필 · 이 기기에 저장됩니다.'}</Text>{cloud&&!session&&<>{registrationFields}{appleLoginEnabled&&Platform.OS==='ios'&&<AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={8} style={[s.appleButton,(!onlineRegistrationReady||authBusy)&&s.disabled]} onPress={()=>{if(onlineRegistrationReady&&!authBusy)void signIn('apple');}}/>}<Button title="Google로 로그인" onPress={()=>void signIn('google')} disabled={!onlineRegistrationReady||authBusy}/><Text style={s.small}>로컬 기록은 이 기기에 남습니다. 로그인 계정의 기록은 별도로 관리됩니다.</Text></>}<Field value={name} onChange={setName} placeholder="프로필 이름"/><Button title="이름 저장" disabled={!name.trim()} onPress={async()=>{if(await commit(d=>({...d,name:name.trim().slice(0,40)})))pop();}}/><View style={s.row}><Button quiet title="이용약관" onPress={()=>go('legal','terms')}/><Button quiet title="개인정보처리방침" onPress={()=>go('legal','privacy')}/><Button quiet title="국외 이전 안내" onPress={()=>go('legal','overseas')}/><Button quiet title="커뮤니티 운영정책" onPress={()=>go('legal','community')}/></View><View style={s.panel}><Text style={s.cardTitle}>도움말과 문의</Text><Text style={s.small}>신고, 저작권, 개인정보, 계정 삭제 문의를 받고 있어요.</Text><Button quiet title="도움말·문의 페이지" onPress={()=>void Linking.openURL(SUPPORT_URL).catch(()=>Alert.alert('페이지를 열지 못했어요',SUPPORT_URL))}/><Button quiet title="이메일로 문의" onPress={()=>void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bean Chillin 앱 문의')}`).catch(()=>Alert.alert('메일 앱을 열지 못했어요',SUPPORT_EMAIL))}/></View>{blockedOwners.length>0&&<><Text style={s.heading}>차단한 Cafe</Text>{blockedOwners.map(id=><View key={id} style={s.row}><Text style={s.muted}>{allCafes.find(c=>c.id===id)?.name??id}</Text><Button quiet title="차단 해제" onPress={()=>void unblockOwner(id).then(()=>setBlockedOwners(ids=>ids.filter(x=>x!==id))).catch(e=>Alert.alert('차단을 해제하지 못했어요',e instanceof Error?e.message:'다시 시도해 주세요.'))}/></View>)}</>}<Button quiet title={session?'로그아웃':'프로필에서 나가기'} onPress={()=>void signOut()}/>{!session&&<Button quiet title="내 로컬 데이터 삭제" onPress={()=>Alert.alert('내 데이터를 삭제할까요?','Cafe, 레시피, 초안, 팔로우, 저장 및 맛 기록이 기기에서 삭제되며 되돌릴 수 없습니다.',[{text:'취소',style:'cancel'},{text:'삭제',style:'destructive',onPress:async()=>{if(await commit(()=>({...emptyData}))) {setName('');reset('home');}}}])}/>}</>}
    </ScrollView>
    {tab&&<View style={s.nav}>{(['home','search','saved','profile'] as const).map((screen,i)=>{const active=route.screen===screen;return <Pressable key={screen} style={[s.navItem,active&&s.navItemActive]} onPress={()=>reset(screen)}><Text style={[s.navIcon,active&&s.navTextActive]}>{['⌂','⌕','♡','◉'][i]}</Text><Text style={[s.navText,active&&s.navTextActive]}>{['홈','탐색','저장','내 Cafe'][i]}</Text></Pressable>;})}</View>}
  </KeyboardAvoidingView>;
}
export default function CafeApp(){return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:paper}}><StatusBar style="dark"/><Application/></SafeAreaView></SafeAreaProvider>;}
const s=StyleSheet.create({
  body:{paddingHorizontal:18,paddingTop:18,gap:20,paddingBottom:48},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  brandEyebrow:{fontSize:10,letterSpacing:2.2,color:'#817468',fontWeight:'700'},brand:{fontFamily:'Georgia',fontSize:34,lineHeight:42,letterSpacing:-1.2,color:ink,marginTop:3},title:{fontFamily:'Georgia',fontSize:30,lineHeight:40,color:ink},heading:{fontFamily:'Georgia',fontSize:22,lineHeight:30,color:ink},
  muted:{fontSize:14,lineHeight:23,color:'#786C61'},small:{fontSize:12,lineHeight:19,color:'#817468'},eyebrow:{fontSize:10,letterSpacing:1.2,color:orange,fontWeight:'800'},moderation:{fontSize:11,lineHeight:18,color:'#8E5C45',fontWeight:'700'},
  button:{borderRadius:8,paddingVertical:13,paddingHorizontal:17,backgroundColor:orange,alignItems:'center',borderWidth:1,borderColor:orange},quiet:{backgroundColor:'transparent',borderColor:'#CFC2B3'},buttonText:{color:'#FFF9F1',fontWeight:'700',fontSize:13},
  textAction:{paddingVertical:8,borderBottomWidth:1,borderColor:'#A99786'},textActionLabel:{color:ink,fontSize:12,fontWeight:'700'},refreshLink:{alignSelf:'flex-end',paddingVertical:2},refreshLinkText:{color:'#817468',fontSize:11,borderBottomWidth:1,borderColor:'#CFC2B3'},
  input:{backgroundColor:'#FBF7F1',borderRadius:8,borderWidth:1,borderColor:'#D8CCBE',padding:15,fontSize:15,color:ink},hero:{backgroundColor:'#6C715C',borderRadius:10,padding:22,gap:13},heroTitle:{fontFamily:'Georgia',fontSize:31,lineHeight:39,color:'#FFF9F1'},white:{color:'#FFF9F1',fontWeight:'600',fontSize:13},
  birthField:{gap:8},birthLabel:{fontSize:12,fontWeight:'700',color:ink},birthButton:{minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#FBF7F1',borderRadius:8,borderWidth:1,borderColor:'#D8CCBE',paddingHorizontal:15},birthValue:{fontSize:16,fontWeight:'700',color:ink},birthPlaceholder:{fontSize:15,color:'#91867D'},birthIcon:{fontSize:18,color:orange},
  dateBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(43,36,31,.35)'},dateSheet:{backgroundColor:paper,borderTopLeftRadius:18,borderTopRightRadius:18,paddingHorizontal:18,paddingTop:16,paddingBottom:28},dateSheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dateCancel:{fontSize:14,color:'#786C61',paddingVertical:8},dateTitle:{fontFamily:'Georgia',fontSize:18,color:ink},dateDone:{fontSize:14,fontWeight:'800',color:orange,paddingVertical:8},dateSummary:{fontSize:22,fontWeight:'800',color:ink,textAlign:'center',marginTop:18,marginBottom:8},wheels:{flexDirection:'row',gap:8,height:220},wheelColumn:{flex:1},wheelLabel:{fontSize:11,fontWeight:'700',color:'#91867D',textAlign:'center',marginBottom:4},wheelWindow:{height:188,overflow:'hidden',position:'relative'},wheelSelection:{position:'absolute',left:2,right:2,top:72,height:44,borderRadius:10,backgroundColor:'#EFE4D7'},wheelContent:{paddingVertical:72},wheelItem:{height:44,alignItems:'center',justifyContent:'center'},wheelItemText:{fontSize:17,color:'#A2978D'},wheelItemSelected:{fontSize:19,fontWeight:'800',color:ink},
  featured:{height:306,borderRadius:10,overflow:'hidden',position:'relative',backgroundColor:'#6C715C'},featuredImage:{width:'100%',height:'100%'},featuredShade:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(32,25,20,.31)'},featuredCopy:{position:'absolute',left:20,right:20,bottom:20,gap:8},featuredEyebrow:{color:'#FFF9F1',fontSize:10,fontWeight:'800',letterSpacing:1.6},
  searchPrompt:{minHeight:50,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderTopWidth:1,borderColor:'#D8CCBE',paddingHorizontal:2},searchPromptIcon:{fontSize:20,color:'#8B7B6E'},searchPromptText:{fontSize:14,color:'#8B7B6E'},
  searchField:{minHeight:52,flexDirection:'row',alignItems:'center',gap:9,backgroundColor:'#FBF7F1',borderRadius:8,borderWidth:1,borderColor:'#D8CCBE',paddingHorizontal:14},searchIcon:{fontSize:18,color:'#817468'},searchInput:{flex:1,minWidth:0,paddingVertical:13,fontSize:15,color:ink},
  cup:{alignItems:'center',justifyContent:'center',height:130},cafeChip:{width:104,alignItems:'center',gap:8,paddingVertical:4},cafeName:{fontFamily:'Georgia',fontSize:14,lineHeight:18,color:ink,textAlign:'center'},logo:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#F7F1E8'},
  card:{backgroundColor:'transparent',paddingVertical:12,borderTopWidth:1,borderColor:'#D8CCBE',flexDirection:'row',gap:14,alignItems:'center'},thumb:{width:82,height:92,borderRadius:6,alignItems:'center',justifyContent:'center'},cardTitle:{fontFamily:'Georgia',fontSize:16,lineHeight:23,color:ink},
  panel:{backgroundColor:'#EFE6DA',borderRadius:8,padding:16,gap:7},cover:{width:'100%',height:248,borderRadius:8},empty:{paddingVertical:30,textAlign:'center',color:'#817468'},
  beanCard:{backgroundColor:'#E9E0D2',borderRadius:8,padding:10,flexDirection:'row',alignItems:'center',gap:14},beanImage:{width:96,height:96,borderRadius:5},beanCopy:{flex:1,minWidth:0,gap:5},
  cupOptions:{flexDirection:'row',gap:8,flexWrap:'wrap'},cupOption:{borderWidth:1,borderColor:'#CFC2B3',borderRadius:5,paddingHorizontal:12,paddingVertical:9},cupOptionActive:{backgroundColor:ink,borderColor:ink},cupOptionText:{color:'#786C61',fontSize:11,fontWeight:'700'},cupOptionTextActive:{color:'#FFF9F1'},
  nav:{flexDirection:'row',borderTopWidth:1,borderColor:'#D8CCBE',paddingHorizontal:8,paddingTop:8,paddingBottom:6,alignItems:'center',backgroundColor:paper},navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3,paddingVertical:7},navItemActive:{borderTopWidth:2,borderColor:orange},navIcon:{fontSize:18,lineHeight:22,color:'#8B7B6E'},navText:{fontSize:10,fontWeight:'600',color:'#8B7B6E'},navTextActive:{color:orange},
  brewScreen:{flex:1},brewHeader:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingTop:4},brewRecipeTitle:{flex:1,minWidth:0,textAlign:'right',fontSize:12,lineHeight:19,color:'#766C65'},
  track:{height:3,backgroundColor:'#DED3C5',marginTop:12,marginHorizontal:16,overflow:'hidden'},brew:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24,paddingVertical:20,gap:25},amount:{fontFamily:'Georgia',fontSize:66,letterSpacing:-2,color:ink},
  brewStepTitle:{maxWidth:340,textAlign:'center',fontFamily:'Georgia',fontSize:29,lineHeight:39,color:ink},brewHint:{maxWidth:340,textAlign:'center',fontSize:14,lineHeight:23,color:'#786C61'},
  stepMedia:{width:'100%',height:190,borderRadius:6,backgroundColor:'#DED3C5'},stepMediaFrame:{width:'100%',height:190,borderRadius:6,overflow:'hidden',backgroundColor:ink},stepMediaCompact:{width:'100%',maxWidth:340,height:170},stepVideo:{width:'100%',height:'100%'},
  brewActions:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingTop:8,paddingBottom:12},brewControl:{flex:1,minWidth:0,borderRadius:7,paddingHorizontal:6,paddingVertical:14,backgroundColor:'#E9E0D2',alignItems:'center',borderWidth:1,borderColor:'#D8CCBE'},brewControlPrimary:{backgroundColor:orange,borderColor:orange},brewControlText:{color:ink,fontWeight:'700',fontSize:13},brewControlTextPrimary:{color:'#FFF9F1'},disabled:{opacity:0.4},
  validation:{color:'#A33A2B',fontSize:12,lineHeight:18},consentRow:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:4},checkbox:{width:22,height:22,borderRadius:4,borderWidth:1,borderColor:'#A99786',textAlign:'center',lineHeight:20,color:orange,fontWeight:'800'},consentText:{flex:1,color:ink,fontSize:13,lineHeight:21},appleButton:{width:'100%',height:48},legalBody:{fontSize:14,lineHeight:24,color:ink},
});
