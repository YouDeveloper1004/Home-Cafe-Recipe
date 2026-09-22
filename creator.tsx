import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useRef, useState } from 'react';
import { seconds, validateRecipe, BeanRecommendation, RoastLevel } from './domain';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';

const STORAGE_KEY = '@cafe/creator-data/v1';

const C = {
  ink: '#2B241F',
  muted: '#786C61',
  cream: '#EDE4D7',
  paper: '#F7F1E8',
  line: '#D8CCBE',
  orange: '#B8674B',
  orangeSoft: '#E8D4C5',
  green: '#6C715C',
};

const demoRecipeAssets = {
  cover: require('./assets/demo-recipe/honey-apricot-cover.jpg'),
  grind: require('./assets/demo-recipe/honey-apricot-grind.jpg'),
  bloom: require('./assets/demo-recipe/honey-apricot-bloom.jpg'),
};
const EQUIPMENT_OPTIONS = ['V60', '오리가미', '에어로프레스'];
const FLOW_LABELS = ['기본 정보', '재료·원두', '단계 추가', '최종 확인'];
const SHOW_TEST_FILL = typeof __DEV__ !== 'undefined' && __DEV__;
const VIDEO_UPLOAD_ENABLED = process.env.EXPO_PUBLIC_VIDEO_UPLOAD_ENABLED === 'true';

function assetUri(asset: number): string {
  return Image.resolveAssetSource?.(asset)?.uri ?? '';
}

export type CreatorCafe = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  color: string;
};

export type RecipeStep = {
  id: string;
  type: 'action' | 'timer';
  title: string;
  value: string;
  media?: { type: 'image' | 'video'; uri: string; duration?: number; storagePath?: string; storageBucket?: 'recipe-media-private' | 'recipe-images' };
};

export type CreatorRecipe = {
  photo?: string;
  photoStoragePath?: string;
  photoStorageBucket?: 'recipe-media-private' | 'recipe-images';
  id: string;
  title: string;
  description: string;
  equipment: string;
  beans: string;
  bean?: BeanRecommendation;
  baseVolumeMl: number;
  water: string;
  temperature: string;
  duration: string;
  steps: RecipeStep[];
  publishedAt: string;
};

export type CreatorData = {
  cafe: CreatorCafe | null;
  recipes: CreatorRecipe[];
};

export const demoUser = {
  id: 'demo-user-01',
  name: '로컬 사용자',
  email: '이 기기에 저장되는 프로필',
  provider: '로컬 체험',
};

export async function loadCreatorData(): Promise<CreatorData> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return { cafe: null, recipes: [] };
    return JSON.parse(stored) as CreatorData;
  } catch {
    return { cafe: null, recipes: [] };
  }
}

export async function saveCreatorData(data: CreatorData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ScreenHeader({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable style={styles.backButton} onPress={onBack}><Text style={styles.backText}>‹</Text></Pressable>
      ) : <View style={styles.headerSpacer} />}
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer}>{action}</View>
    </View>
  );
}

export function CreatorProfileScreen({
  cafe,
  recipes,
  onCreateCafe,
  onCreateRecipe,
}: {
  cafe: CreatorCafe | null;
  recipes: CreatorRecipe[];
  onCreateCafe: () => void;
  onCreateRecipe: () => void;
}) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileTop}>
        <Text style={styles.pageEyebrow}>MY ACCOUNT</Text>
        <Pressable style={styles.settingsButton}><Text style={styles.settingsText}>•••</Text></Pressable>
      </View>
      <View style={styles.userRow}>
        <View style={styles.userAvatar}><Text style={styles.userAvatarText}>SY</Text></View>
        <View style={styles.userCopy}>
          <Text style={styles.userName}>{demoUser.name}</Text>
          <Text style={styles.userEmail}>{demoUser.email}</Text>
          <View style={styles.providerPill}><Text style={styles.providerText}>{demoUser.provider}</Text></View>
        </View>
      </View>

      {!cafe ? (
        <View style={styles.emptyCafeCard}>
          <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
          <Text style={styles.emptyTitle}>나만의 Cafe를 열어보세요</Text>
          <Text style={styles.emptyBody}>좋아하는 커피와 나만의 추출법을{`\n`}사람들에게 공유할 수 있어요.</Text>
          <Pressable style={styles.primaryButton} onPress={onCreateCafe}>
            <Text style={styles.primaryButtonText}>Cafe 만들기</Text><Text style={styles.primaryArrow}>→</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.myCafeCard, { backgroundColor: cafe.color }]}>
            <View style={styles.myCafeTop}>
              <View style={styles.myCafeLogo}><Text style={[styles.myCafeLogoText, { color: cafe.color }]}>{cafe.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.ownerPill}><Text style={styles.ownerPillText}>OWNER</Text></View>
            </View>
            <Text style={styles.myCafeName}>{cafe.name}</Text>
            <Text style={styles.myCafeHandle}>@{cafe.handle}</Text>
            <Text style={styles.myCafeBio}>{cafe.bio}</Text>
            <View style={styles.myCafeStats}>
              <Text style={styles.myCafeStat}>레시피 {recipes.length}</Text>
              <Text style={styles.myCafeStat}>단골 0</Text>
              <Text style={styles.myCafeStat}>따라 내림 0</Text>
            </View>
          </View>

          <View style={styles.recipeSectionHeader}>
            <View><Text style={styles.recipeSectionEyebrow}>MY RECIPES</Text><Text style={styles.recipeSectionTitle}>내가 올린 레시피</Text></View>
            <Pressable style={styles.smallAddButton} onPress={onCreateRecipe}><Text style={styles.smallAddButtonText}>＋ 새 레시피</Text></Pressable>
          </View>

          {recipes.length === 0 ? (
            <Pressable style={styles.emptyRecipe} onPress={onCreateRecipe}>
              <Text style={styles.emptyRecipeIcon}>☕</Text>
              <Text style={styles.emptyRecipeTitle}>아직 레시피가 없어요</Text>
              <Text style={styles.emptyRecipeBody}>첫 번째 레시피를 올려보세요</Text>
            </Pressable>
          ) : (
            <View style={styles.recipeList}>
              {recipes.map((recipe) => (
                <View style={styles.recipeCard} key={recipe.id}>
                  <View style={styles.recipeThumb}><Text style={styles.recipeThumbText}>{recipe.equipment === 'V60' ? 'V60' : recipe.equipment.slice(0, 3)}</Text></View>
                  <View style={styles.recipeInfo}>
                    <Text style={styles.publishedLabel}>게시됨 · {recipe.steps.length}단계</Text>
                    <Text style={styles.recipeTitle}>{recipe.title}</Text>
                  <Text style={styles.recipeMeta}>{recipe.equipment} · {recipe.bean?.product ? `${recipe.bean.product} · ` : ''}{recipe.beans} · {recipe.duration}</Text>
                  </View>
                  <Text style={styles.recipeMore}>•••</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

export function CreateCafeScreen({ onBack, onSave, initial }: { onBack: () => void; onSave: (cafe: CreatorCafe) => void; initial?: CreatorCafe }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [error, setError] = useState('');

  function submit() {
    const cleanHandle = handle.trim().replace(/^@/, '').replace(/\s+/g, '').toLowerCase();
    if (!name.trim()) return setError('Cafe 이름을 입력해 주세요.');
    if (!/^[a-z0-9_]{3,24}$/.test(cleanHandle)) return setError('핸들은 영문 소문자·숫자·밑줄 3~24자로 입력해 주세요.');
    if (!bio.trim()) return setError('Cafe를 소개하는 문장을 입력해 주세요.');
    onSave({ id: initial?.id ?? `cafe-${Date.now()}`, name: name.trim(), handle: cleanHandle, bio: bio.trim(), color: C.green });
  }

  return (
    <KeyboardAvoidingView style={styles.formPage} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={initial ? 'Cafe 수정' : 'Cafe 만들기'} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.formEyebrow}>OPEN YOUR CAFE</Text>
        <Text style={styles.formTitle}>어떤 Cafe를{`\n`}만들어 볼까요?</Text>
        <Text style={styles.formIntro}>나중에 언제든 프로필에서 수정할 수 있어요.</Text>

        <View style={styles.logoPicker}>
          <View style={styles.logoPreview}><Text style={styles.logoPreviewText}>{name.trim().slice(0, 1).toUpperCase() || 'C'}</Text></View>
          <View><Text style={styles.logoPickerTitle}>Cafe 프로필</Text><Text style={styles.logoPickerHint}>이름의 첫 글자로 만들어져요</Text></View>
        </View>

        <Field label="Cafe 이름" value={name} onChangeText={setName} placeholder="예: 승문의 커피" maxLength={24} />
        <Field label="핸들" value={handle} onChangeText={setHandle} placeholder="seungmooncoffee" prefix="@" autoCapitalize="none" maxLength={24} />
        <Field label="소개" value={bio} onChangeText={setBio} placeholder="어떤 커피와 레시피를 나누고 싶나요?" multiline maxLength={120} />
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable style={styles.formSubmit} onPress={submit}><Text style={styles.formSubmitText}>{initial ? '수정 저장' : '내 Cafe 열기'}</Text><Text style={styles.formSubmitArrow}>→</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function CreateRecipeScreen({ cafe, onBack, onPublish, onDraft, initial, online = false }: { cafe: CreatorCafe; onBack: () => void; onPublish: (recipe: CreatorRecipe) => void; onDraft?: (recipe: CreatorRecipe) => void; initial?: CreatorRecipe; online?: boolean }) {
  const scrollRef = useRef<ScrollView>(null);
  const [flowStep, setFlowStep] = useState(0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [equipment, setEquipment] = useState(initial?.equipment ?? 'V60');
  const [customEquipment, setCustomEquipment] = useState(Boolean(initial?.equipment && !EQUIPMENT_OPTIONS.includes(initial.equipment)));
  const [beans, setBeans] = useState(initial?.beans ?? '20g');
  const [beanProduct, setBeanProduct] = useState(initial?.bean?.product ?? '');
  const [beanRoaster, setBeanRoaster] = useState(initial?.bean?.roaster ?? '');
  const [beanOrigin, setBeanOrigin] = useState(initial?.bean?.origin ?? '');
  const [beanProcess, setBeanProcess] = useState(initial?.bean?.process ?? '');
  const [beanRoast, setBeanRoast] = useState<RoastLevel>(initial?.bean?.roast ?? '라이트');
  const [baseVolumeMl, setBaseVolumeMl] = useState(String(initial?.baseVolumeMl ?? (parseFloat(initial?.water ?? '') || 300)));
  const [water, setWater] = useState(initial?.water ?? '300g');
  const [temperature, setTemperature] = useState(initial?.temperature ?? '92°C');
  const [duration, setDuration] = useState(initial?.duration ?? '2:30');
  const [photo, setPhoto] = useState(initial?.photo);
  const [stepType, setStepType] = useState<'action' | 'timer'>('action');
  const [stepTitle, setStepTitle] = useState('');
  const [stepValue, setStepValue] = useState('');
  const [stepMedia, setStepMedia] = useState<RecipeStep['media']>();
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>(initial?.steps ?? []);
  const [error, setError] = useState('');
  const [demoLoaded, setDemoLoaded] = useState(false);

  function loadDemoRecipe() {
    const grind = assetUri(demoRecipeAssets.grind);
    const bloom = assetUri(demoRecipeAssets.bloom);
    setTitle('살구 꿀처럼 달콤한 V60');
    setDescription('잘 익은 살구의 산뜻함과 꿀처럼 둥근 단맛을 살리는 따뜻한 핸드드립 레시피예요.');
    setEquipment('V60 드리퍼, 서버, 저울, 구스넥 주전자');
    setCustomEquipment(true);
    setBeans('20g');
    setBeanProduct('에티오피아 구지 함벨라');
    setBeanRoaster('여름결 로스터스');
    setBeanOrigin('에티오피아 구지');
    setBeanProcess('내추럴');
    setBeanRoast('라이트');
    setBaseVolumeMl('300');
    setWater('300g');
    setTemperature('92°C');
    setDuration('2:40');
    setPhoto(assetUri(demoRecipeAssets.cover));
    setSteps([
      { id: 'demo-grind', type: 'action', title: '원두를 중간보다 조금 가늘게 분쇄해 주세요', value: '20g', media: grind ? { type: 'image', uri: grind } : undefined },
      { id: 'demo-rinse', type: 'action', title: '필터를 충분히 린싱하고 서버의 물을 비워 주세요', value: '' },
      { id: 'demo-bloom-pour', type: 'action', title: '커피층 전체가 젖도록 중심부터 천천히 부어 주세요', value: '45g', media: bloom ? { type: 'image', uri: bloom } : undefined },
      { id: 'demo-bloom-wait', type: 'timer', title: '커피가 부풀며 향을 열도록 기다려요', value: '35초' },
      { id: 'demo-main-pour', type: 'action', title: '작은 원을 그리며 누적 180g까지 부어 주세요', value: '180g' },
      { id: 'demo-drawdown', type: 'timer', title: '물 높이가 절반으로 내려갈 때까지 기다려요', value: '20초' },
      { id: 'demo-finish', type: 'action', title: '누적 300g까지 부은 뒤 가볍게 흔들어 마무리하세요', value: '300g' },
    ]);
    setStepTitle('');
    setStepValue('');
    setStepMedia(undefined);
    setEditingStep(null);
    setError('');
    setDemoLoaded(true);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function moveFlow(next: number) {
    setError('');
    scrollRef.current?.scrollTo({y:0,animated:false});
    setFlowStep(next);
  }
  function nextFlow() {
    if (flowStep === 0 && (!title.trim() || !description.trim())) return setError('제목과 설명을 입력해 주세요.');
    if (flowStep === 0) {
      if (!equipment.trim()) return setError('필요한 도구를 입력해 주세요.');
    }
    if (flowStep === 1) {
      if (![baseVolumeMl, beans, water, temperature].every(value => Number.isFinite(parseFloat(value)) && parseFloat(value) > 0)) return setError('기준 컵 사이즈, 원두량, 물의 양, 온도에 양수를 입력해 주세요.');
      if (!seconds(duration)) return setError('추출 시간은 2:30 또는 150초 형식으로 입력해 주세요.');
    }
    if (flowStep === 2) {
      if (stepTitle.trim() || stepValue.trim() || stepMedia) return setError('입력 중인 단계를 먼저 저장하거나 비워 주세요.');
      const problem = validateRecipe(currentRecipe());
      if (problem) return setError(problem);
    }
    moveFlow(Math.min(3, flowStep + 1));
  }

  function addStep() {
    if (stepType === 'action' && !stepTitle.trim() && !stepMedia) return setError('설명을 입력하거나 사진·영상을 추가해 주세요.');
    if (stepType === 'timer' && (seconds(stepValue) < 1 || seconds(stepValue) > 3600)) return setError('대기 시간은 1~3600초로 입력해 주세요.');
    const fallbackTitle=stepType==='timer'?`${stepValue.trim()} 동안 기다려 주세요`:'이미지를 참고해 진행해 주세요';
    const nextStep = { id: editingStep ?? `step-${Date.now()}`, type: stepType, title: stepTitle.trim()||fallbackTitle, value: stepValue.trim(), media: stepMedia };
    setSteps((current) => editingStep ? current.map(step => step.id === editingStep ? nextStep : step) : [...current, nextStep]);
    setEditingStep(null);
    setStepTitle('');
    setStepValue('');
    setStepMedia(undefined);
    setError('');
  }

  function removeStep(id: string) {
    setSteps((current) => current.filter((step) => step.id !== id));
  }

  function currentRecipe(): CreatorRecipe {
    return {
      id: initial?.id ?? `recipe-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
      title: title.trim(), description: description.trim(), equipment,
      beans: beans.trim(),
      bean: beanProduct.trim() ? { product: beanProduct.trim(), roaster: beanRoaster.trim() || undefined, origin: beanOrigin.trim() || undefined, process: beanProcess.trim() || undefined, roast: beanRoast, dose: beans.trim() } : undefined,
      baseVolumeMl: Number(baseVolumeMl),
      water: water.trim(), temperature: temperature.trim(), duration: duration.trim(),
      steps, photo, publishedAt: new Date().toISOString(),
    };
  }
  function publish() {
    if (stepTitle.trim() || stepValue.trim()) return setError('입력 중인 단계를 먼저 추가하거나 비워 주세요.');
    const recipe = currentRecipe();
    const problem = validateRecipe(recipe);
    if (problem) return setError(problem);
    onPublish(recipe);
  }
  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4,3], exif: false });
      if (!result.canceled) {
        const source = new File(result.assets[0].uri);
        const destination = new File(Paths.document, `recipe-${Date.now()}${source.extension || '.jpg'}`);
        source.copy(destination);
        setPhoto(destination.uri);
      }
    } catch { setError('사진을 열 수 없어요. 사진 접근 권한을 확인해 주세요.'); }
  }
  async function pickStepMedia(type: 'image' | 'video') {
    try {
      if (type === 'video' && !VIDEO_UPLOAD_ENABLED) {
        setError('영상 업로드는 개인정보 메타데이터 제거 기능을 준비한 뒤 제공할 예정이에요. 지금은 사진을 이용해 주세요.');
        return;
      }
      if (type === 'video') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return setError('영상을 선택하려면 사진 보관함 권한이 필요해요.');
      }
      const result = await ImagePicker.launchImageLibraryAsync(type === 'image'
        ? { mediaTypes: ['images'], quality: 0.75, allowsEditing: true, aspect: [16,9], exif: false }
        : { mediaTypes: ['videos'], allowsEditing: false, videoMaxDuration: 30, videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (type === 'video' && (asset.duration ?? 0) > 30000) return setError('단계 영상은 30초 이하로 선택해 주세요.');
      if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) return setError('단계 미디어는 10MB 이하로 선택해 주세요.');
      const source = new File(asset.uri);
      const destination = new File(Paths.document, `step-${Date.now()}${source.extension || (type === 'video' ? '.mp4' : '.jpg')}`);
      source.copy(destination);
      setStepMedia({type,uri:destination.uri,duration:asset.duration ?? undefined});
      setError('');
    } catch { setError(type === 'video' ? '영상을 열 수 없어요. 사진 보관함 권한을 확인해 주세요.' : '사진을 열 수 없어요.'); }
  }
  function moveStep(index: number, offset: number) {
    if (index + offset < 0 || index + offset >= steps.length) return;
    setSteps(current => { const next = [...current]; [next[index], next[index+offset]] = [next[index+offset], next[index]]; return next; });
  }

  return (
    <KeyboardAvoidingView style={styles.formPage} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={initial ? '레시피 편집' : '새 레시피'} onBack={onBack} action={<Pressable onPress={() => { if(stepTitle.trim() || stepValue.trim() || stepMedia) { setError('작성 중인 단계를 먼저 저장해 주세요.'); return; } onDraft?.(currentRecipe()); }}><Text style={styles.draftText}>초안 저장</Text></Pressable>} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.recipeFormContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.cafeByline}><View style={[styles.bylineLogo, { backgroundColor: cafe.color }]}><Text style={styles.bylineLogoText}>{cafe.name.slice(0, 1)}</Text></View><Text style={styles.bylineText}>{cafe.name}에 게시</Text></View>
        <View style={styles.progressHeader}><Text style={styles.progressCount}>{flowStep+1} / {FLOW_LABELS.length}</Text><Text style={styles.progressName}>{FLOW_LABELS[flowStep]}</Text></View>
        <View style={styles.flowLabels}>{FLOW_LABELS.map((label,index)=><View accessibilityLabel={`${index+1}단계 ${label}`} key={label} style={[styles.flowDot,index<=flowStep&&styles.flowDotActive]}/>)}</View>
        <View style={styles.flowTop}>
          <Text style={styles.flowEyebrow}>{flowStep===0?'BASIC INFO':flowStep===1?'BEANS & RATIO':flowStep===2?`LIVE STEPS · ${steps.length}개 저장됨`:'READY TO PUBLISH'}</Text>
          <Text style={styles.flowTitle}>{flowStep===0?'레시피를 소개해 주세요':flowStep===1?'원두와 기준 비율을 알려주세요':flowStep===2?(editingStep?'단계 수정':`단계 ${steps.length+1} 만들기`):'게시 전 확인'}</Text>
          <Text style={styles.flowDescription}>{flowStep===0?'표지, 이름, 설명과 필요한 도구를 먼저 정리해요.':flowStep===1?'기준 컵 사이즈를 바탕으로 다른 용량에도 같은 비율을 적용해요.':flowStep===2?'설명·사진·영상·타이머를 원하는 방식으로 넣고, 단계를 계속 추가하세요.':'저장한 단계와 레시피 정보를 확인해요.'}</Text>
        </View>

        {SHOW_TEST_FILL&&!initial&&flowStep===0&&<Pressable accessibilityRole="button" style={[styles.demoFillButton,demoLoaded&&styles.demoFillButtonLoaded]} onPress={loadDemoRecipe}>
          <View style={styles.demoFillCopy}><Text style={styles.demoFillEyebrow}>QUICK START</Text><Text style={styles.demoFillTitle}>{demoLoaded?'예시가 채워졌어요':'예시로 빠르게 시작하기'}</Text><Text style={styles.demoFillHint}>{demoLoaded?'내용을 바꾸거나 다음 화면으로 넘어가 직접 게시해 보세요.':'표지 사진 1장 · 원두 정보 · 추출 단계를 미리 채워요.'}</Text></View>
          <Text style={styles.demoFillArrow}>{demoLoaded?'✓':'＋'}</Text>
        </Pressable>}

        {flowStep===0&&<View>
          <Pressable style={styles.recipePhotoPicker} onPress={pickPhoto}>{photo ? <Image source={{uri:photo}} style={styles.recipePhoto} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderIcon}>▣</Text><Text style={styles.photoPlaceholderTitle}>표지 사진 추가</Text><Text style={styles.photoPlaceholderHint}>선택사항 · 커피의 느낌을 보여주세요</Text></View>}</Pressable>
          {photo && <Pressable style={styles.photoRemove} onPress={() => setPhoto(undefined)}><Text style={styles.photoRemoveText}>사진 제거</Text></Pressable>}
          <Field label="레시피 제목" value={title} onChangeText={setTitle} placeholder="예: 복숭아처럼 산뜻한 V60" maxLength={48} />
          <Field label="한 줄 설명" value={description} onChangeText={setDescription} placeholder="이 레시피의 맛과 포인트를 알려주세요" multiline maxLength={160} />
          <Text style={styles.sectionQuestion}>필요한 도구</Text>
          <Text style={styles.sectionHint}>가장 가까운 도구를 고르거나 직접 입력하세요.</Text>
          <View style={styles.chipRow}>
            {EQUIPMENT_OPTIONS.map((item) => <Pressable key={item} style={[styles.choiceChip,!customEquipment&&equipment === item&&styles.choiceChipActive]} onPress={() => {setEquipment(item);setCustomEquipment(false);}}><Text style={[styles.choiceChipText,!customEquipment&&equipment === item&&styles.choiceChipTextActive]}>{item}</Text></Pressable>)}
            <Pressable style={[styles.choiceChip,customEquipment&&styles.choiceChipActive]} onPress={() => {setCustomEquipment(true);if(EQUIPMENT_OPTIONS.includes(equipment))setEquipment('');}}><Text style={[styles.choiceChipText,customEquipment&&styles.choiceChipTextActive]}>직접 입력</Text></Pressable>
          </View>
          {customEquipment&&<Field label="도구 직접 입력" value={equipment} onChangeText={setEquipment} placeholder="예: 칼리타 웨이브, 서버, 저울" maxLength={80} />}
        </View>}

        {flowStep===1&&<View>
          <View style={styles.formGroupHeader}><Text style={styles.formGroupEyebrow}>BEAN PROFILE</Text><Text style={styles.formGroupTitle}>원두 특성</Text></View>
          <Text style={styles.sectionHint}>실제 판매 제품과 원두 특성을 나누어 적으면 사용자가 같은 원두를 찾기 쉬워요.</Text>
          <Field label="추천 원두 제품" value={beanProduct} onChangeText={setBeanProduct} placeholder="예: 프릳츠 아니 온두라스" maxLength={60} />
          <View style={styles.inlineFields}>
            <View style={styles.inlineField}><Field label="로스터 / 카페" value={beanRoaster} onChangeText={setBeanRoaster} placeholder="예: 프릳츠" maxLength={40} /></View>
            <View style={styles.inlineField}><Field label="원산지" value={beanOrigin} onChangeText={setBeanOrigin} placeholder="예: 온두라스 코판" maxLength={40} /></View>
          </View>
          <Field label="가공 방식" value={beanProcess} onChangeText={setBeanProcess} placeholder="예: 워시드, 내추럴, 허니" maxLength={30} />
          <Text style={styles.quickChoiceLabel}>배전도</Text>
          <View style={styles.roastRow}>{(['라이트','미디엄','다크'] as RoastLevel[]).map(level=><Pressable key={level} style={[styles.roastChoice,beanRoast===level&&styles.roastChoiceActive]} onPress={()=>setBeanRoast(level)}><Text style={[styles.roastChoiceText,beanRoast===level&&styles.roastChoiceTextActive]}>{level}</Text></Pressable>)}</View>

          <View style={styles.groupDivider}/>
          <View style={styles.formGroupHeader}><Text style={styles.formGroupEyebrow}>BASE RATIO</Text><Text style={styles.formGroupTitle}>기준 용량과 계량값</Text></View>
          <Text style={styles.sectionHint}>기준 컵 사이즈는 다른 용량을 선택할 때 원두와 물을 자동 환산하는 기준이에요.</Text>
          <Field label="기준 컵 사이즈 (ml) · 필수" value={baseVolumeMl} onChangeText={setBaseVolumeMl} placeholder="예: 300" keyboardType="decimal-pad" maxLength={5} />
          <View style={styles.gridFields}>
            <MiniField label="사용량 (g)" value={beans} onChangeText={setBeans} numeric />
            <MiniField label="물 (g)" value={water} onChangeText={setWater} numeric />
            <MiniField label="온도 (℃)" value={temperature} onChangeText={setTemperature} numeric />
            <MiniField label="시간" value={duration} onChangeText={setDuration} />
          </View>
          <View style={styles.tipCard}><Text style={styles.tipTitle}>미리보기</Text><Text style={styles.tipText}>기준 {baseVolumeMl||'—'}ml · 원두 {beans||'—'} · 물 {water||'—'} · 온도 {temperature||'—'} · 시간 {duration||'—'}</Text></View>
        </View>}

        {flowStep===2&&<View>
          {!!steps.length&&<View style={styles.stepsHeader}><View><Text style={styles.groupLabel}>지금까지 만든 단계</Text><Text style={styles.stepsHint}>편집·순서 변경도 가능해요</Text></View><View style={styles.stepsCount}><Text style={styles.stepsCountText}>{steps.length}개</Text></View></View>}
          <View style={styles.stepList}>
            {steps.map((step, index) => (
              <View style={styles.stepCard} key={step.id}>
                <View style={[styles.stepNumber, step.type === 'timer' && styles.timerNumber]}><Text style={[styles.stepNumberText, step.type === 'timer' && styles.timerNumberText]}>{step.type === 'timer' ? '◷' : index + 1}</Text></View>
                <View style={styles.stepCopy}><Text style={styles.stepKind}>{step.type === 'timer' ? '자동 타이머' : '탭하여 다음'}</Text><Text style={styles.stepTitle}>{step.title}</Text>{!!step.value && <Text style={styles.stepValue}>{step.value}</Text>}{step.media&&<Text style={styles.stepMediaLabel}>{step.media.type==='video'?`▶ 짧은 영상 ${Math.ceil((step.media.duration??0)/1000)}초`:'▣ 사진'}</Text>}</View>
                <Pressable accessibilityLabel="위로 이동" onPress={() => moveStep(index,-1)}><Text style={styles.removeStep}>↑</Text></Pressable>
                <Pressable accessibilityLabel="아래로 이동" onPress={() => moveStep(index,1)}><Text style={styles.removeStep}>↓</Text></Pressable>
                <Pressable accessibilityLabel="단계 편집" onPress={() => { if(stepTitle.trim()||stepValue.trim()||stepMedia) {setError('작성 중인 단계를 먼저 저장해 주세요.');return;} setStepType(step.type);setStepTitle(step.title);setStepValue(step.value);setStepMedia(step.media);setEditingStep(step.id); }}><Text style={styles.draftText}>편집</Text></Pressable>
                <Pressable accessibilityLabel="단계 삭제" onPress={() => removeStep(step.id)}><Text style={styles.removeStep}>×</Text></Pressable>
              </View>
            ))}
          </View>
          {!steps.length&&<View style={styles.emptySteps}><Text style={styles.emptyStepsIcon}>☕</Text><Text style={styles.emptyStepsTitle}>첫 단계를 추가해 보세요</Text><Text style={styles.emptyStepsHint}>준비부터 추출 마무리까지 순서대로 만들면 돼요.</Text></View>}

          <View style={styles.stepComposer}>
            <Text style={styles.composerTitle}>{editingStep?'이 단계 수정':`단계 ${steps.length+1}에 무엇을 넣을까요?`}</Text>
            <View style={styles.stepTypeRow}>
              <Pressable style={[styles.stepType, stepType === 'action' && styles.stepTypeActive]} onPress={() => setStepType('action')}><Text style={[styles.stepTypeText, stepType === 'action' && styles.stepTypeTextActive]}>설명 또는 이미지</Text></Pressable>
              <Pressable style={[styles.stepType, stepType === 'timer' && styles.stepTypeActive]} onPress={() => setStepType('timer')}><Text style={[styles.stepTypeText, stepType === 'timer' && styles.stepTypeTextActive]}>타이머 설정</Text></Pressable>
            </View>
            <TextInput style={styles.stepInput} value={stepTitle} onChangeText={setStepTitle} placeholder={stepType === 'action' ? '설명 (선택) · 예: 물을 천천히 부어 주세요' : '설명 (선택) · 예: 커피가 부풀기를 기다려요'} placeholderTextColor="#A69C94" />
            {stepMedia&&<View style={styles.stepMediaPreview}>{stepMedia.type==='image'?<Image source={{uri:stepMedia.uri}} style={styles.stepMediaImage}/>:<View style={styles.stepVideoPreview}><Text style={styles.stepVideoIcon}>▶</Text><Text style={styles.stepVideoText}>짧은 영상 · {Math.ceil((stepMedia.duration??0)/1000)}초</Text></View>}<Pressable style={styles.stepMediaRemove} onPress={()=>setStepMedia(undefined)}><Text style={styles.stepMediaRemoveText}>제거</Text></Pressable></View>}
            <View style={styles.stepMediaButtons}>
              <Pressable style={styles.stepMediaButton} onPress={()=>void pickStepMedia('image')}><Text style={styles.stepMediaButtonText}>▣ 사진 추가</Text></Pressable>
              {VIDEO_UPLOAD_ENABLED&&<Pressable style={styles.stepMediaButton} onPress={()=>void pickStepMedia('video')}><Text style={styles.stepMediaButtonText}>▶ 30초 영상</Text></Pressable>}
            </View>
            <View style={styles.stepComposerBottom}>
              <TextInput style={styles.stepValueInput} value={stepValue} onChangeText={setStepValue} placeholder={stepType === 'action' ? '양 (선택)' : '예: 30초'} placeholderTextColor="#A69C94" />
              <Pressable style={styles.addStepButton} onPress={addStep}><Text style={styles.addStepButtonText}>{editingStep ? '수정 저장' : '이 단계 저장 ＋'}</Text></Pressable>
            </View>
          </View>
        </View>}

        {flowStep===3&&<View style={styles.reviewCard}>
          {photo?<Image source={{uri:photo}} style={styles.reviewPhoto}/>:<View style={[styles.reviewPhoto,styles.reviewPhotoEmpty]}><Text style={styles.reviewPhotoEmptyText}>사진 없음</Text></View>}
          <Text style={styles.reviewTitle}>{title}</Text>
          <Text style={styles.reviewDescription}>{description}</Text>
          <View style={styles.reviewTools}><Text style={styles.reviewStatLabel}>필요한 도구</Text><Text style={styles.reviewToolsValue}>{equipment}</Text></View>
          {!!beanProduct&&<View style={styles.reviewBean}><Text style={styles.reviewStatLabel}>추천 원두</Text><Text style={styles.reviewBeanProduct}>{beanProduct}</Text><Text style={styles.reviewBeanMeta}>{[beanRoaster,beanOrigin,beanProcess,beanRoast].filter(Boolean).join(' · ') || '제품 정보'}</Text></View>}
          <View style={styles.reviewStats}>{[[`${baseVolumeMl}ml`,'기준 컵'],[beans,'사용량'],[water,'물'],[temperature,'온도'],[duration,'시간']].map(([value,label])=><View key={label} style={styles.reviewStat}><Text style={styles.reviewStatValue}>{value}</Text><Text style={styles.reviewStatLabel}>{label}</Text></View>)}</View>
          <View style={styles.reviewDivider}/>
          <View style={styles.reviewStepsHeader}><Text style={styles.reviewStepsTitle}>라이브 단계</Text><Text style={styles.stepsCountText}>{steps.length}단계</Text></View>
          {steps.map((step,index)=><View key={step.id} style={styles.reviewStep}><View style={styles.reviewStepNumber}><Text style={styles.reviewStepNumberText}>{index+1}</Text></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{step.title}</Text><Text style={styles.stepValue}>{step.type==='timer'?'자동 타이머':'수행 후 탭'}{step.value?` · ${step.value}`:''}{step.media?` · ${step.media.type==='video'?'영상':'사진'}`:''}</Text></View></View>)}
        </View>}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.flowActions}>
          {flowStep>0&&<Pressable style={styles.flowBackButton} onPress={()=>moveFlow(flowStep-1)}><Text style={styles.flowBackText}>← 이전</Text></Pressable>}
          {flowStep===0&&<Pressable style={styles.flowNextButton} onPress={nextFlow}><Text style={styles.flowNextText}>재료와 원두 입력</Text><Text style={styles.publishArrow}>→</Text></Pressable>}
          {flowStep===1&&<Pressable style={styles.flowNextButton} onPress={nextFlow}><Text style={styles.flowNextText}>단계 만들기</Text><Text style={styles.publishArrow}>→</Text></Pressable>}
          {flowStep===2&&<Pressable disabled={!steps.length} style={[styles.flowNextButton,!steps.length&&styles.flowNextDisabled]} onPress={nextFlow}><Text style={styles.flowNextText}>{steps.length?'단계 입력 마치기':'먼저 단계를 저장해 주세요'}</Text>{!!steps.length&&<Text style={styles.publishArrow}>→</Text>}</Pressable>}
          {flowStep===3&&<Pressable style={styles.flowNextButton} onPress={publish}><Text style={styles.flowNextText}>레시피 게시하기</Text><Text style={styles.publishArrow}>→</Text></Pressable>}
        </View>
        {flowStep===3&&<Text style={styles.publishNotice}>{online ? '게시하면 사진·영상과 레시피가 Cafe에 공개됩니다.' : '현재 이 기기의 Cafe와 피드에 저장됩니다. 온라인 공유는 서버 연결 후 사용할 수 있어요.'}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, prefix, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string; prefix?: string; multiline?: boolean }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, multiline && styles.fieldMultiline]}>
        {!!prefix && <Text style={styles.fieldPrefix}>{prefix}</Text>}
        <TextInput {...props} multiline={multiline} style={[styles.fieldInput, multiline && styles.fieldInputMultiline]} placeholderTextColor="#A69C94" />
      </View>
    </View>
  );
}

function MiniField({ label, value, onChangeText, numeric = false }: { label: string; value: string; onChangeText: (value: string) => void; numeric?: boolean }) {
  return <View style={styles.miniField}><Text style={styles.miniLabel}>{label}</Text><TextInput style={styles.miniInput} value={value} onChangeText={onChangeText} keyboardType={numeric?'decimal-pad':'default'} /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.paper },
  profileContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  profileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageEyebrow: { color: C.orange, fontSize: 11, letterSpacing: 1.8, fontWeight: '900' },
  settingsButton: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  settingsText: { fontSize: 17 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderColor: C.line },
  userAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  userCopy: { marginLeft: 14 },
  userName: { color: C.ink, fontFamily: 'Georgia', fontSize: 23 },
  userEmail: { color: C.muted, fontSize: 11, marginTop: 4 },
  providerPill: { alignSelf: 'flex-start', borderBottomWidth: 1, borderColor: C.line, paddingVertical: 4, marginTop: 7 },
  providerText: { color: C.muted, fontSize: 9, fontWeight: '700' },
  emptyCafeCard: { backgroundColor: C.cream, borderRadius: 8, alignItems: 'center', padding: 26, marginTop: 26 },
  emptyMark: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  emptyMarkText: { color: C.orange, fontSize: 35, fontWeight: '300' },
  emptyTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 22, marginTop: 20 },
  emptyBody: { color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  primaryButton: { width: '100%', height: 54, borderRadius: 8, backgroundColor: C.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 24 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  primaryArrow: { color: '#fff', fontSize: 18 },
  myCafeCard: { borderRadius: 10, padding: 22, marginTop: 24 },
  myCafeTop: { flexDirection: 'row', justifyContent: 'space-between' },
  myCafeLogo: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF9F1', alignItems: 'center', justifyContent: 'center' },
  myCafeLogoText: { fontSize: 22, fontWeight: '900' },
  ownerPill: { alignSelf: 'flex-start', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,.45)', paddingVertical: 5 },
  ownerPillText: { color: '#fff', fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  myCafeName: { color: '#fff', fontFamily: 'Georgia', fontSize: 28, marginTop: 19 },
  myCafeHandle: { color: 'rgba(255,255,255,.62)', fontSize: 11, marginTop: 3 },
  myCafeBio: { color: 'rgba(255,255,255,.82)', fontSize: 12, lineHeight: 19, marginTop: 14 },
  myCafeStats: { flexDirection: 'row', gap: 18, marginTop: 19 },
  myCafeStat: { color: '#fff', fontSize: 10, fontWeight: '700' },
  recipeSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 14 },
  recipeSectionEyebrow: { color: C.orange, fontSize: 9, letterSpacing: 1.5, fontWeight: '900' },
  recipeSectionTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 22, marginTop: 4 },
  smallAddButton: { backgroundColor: C.ink, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 10 },
  smallAddButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  emptyRecipe: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 8, paddingVertical: 28, alignItems: 'center' },
  emptyRecipeIcon: { fontSize: 30 },
  emptyRecipeTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 15, marginTop: 9 },
  emptyRecipeBody: { color: C.muted, fontSize: 11, marginTop: 4 },
  recipeList: { gap: 0 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: C.line, paddingVertical: 12 },
  recipeThumb: { width: 70, height: 70, borderRadius: 5, backgroundColor: '#CF8060', alignItems: 'center', justifyContent: 'center' },
  recipeThumbText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  recipeInfo: { flex: 1, paddingHorizontal: 12 },
  publishedLabel: { color: C.orange, fontSize: 9, fontWeight: '800' },
  recipeTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 14, lineHeight: 19, marginTop: 4 },
  recipeMeta: { color: C.muted, fontSize: 9, marginTop: 7 },
  recipeMore: { color: C.muted, fontSize: 12, alignSelf: 'flex-start', marginTop: 4 },
  formPage: { flex: 1, backgroundColor: C.paper },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, borderBottomWidth: 1, borderColor: C.line },
  backButton: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.ink, fontSize: 31, lineHeight: 34, marginTop: -3 },
  headerTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 15 },
  headerSpacer: { width: 64, alignItems: 'flex-end' },
  draftText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  formContent: { padding: 22, paddingBottom: 42 },
  recipeFormContent: { padding: 22, paddingBottom: 60 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 },
  progressCount: { color: C.orange, fontSize: 11, fontWeight: '900' },
  progressName: { color: C.muted, fontSize: 10, fontWeight: '700' },
  flowTop: { marginTop: 12, marginBottom: 20 },
  flowLabels: { flexDirection: 'row', gap: 6 },
  flowDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.line },
  flowDotActive: { backgroundColor: C.orange },
  flowEyebrow: { color: C.orange, fontSize: 9, letterSpacing: 1.4, fontWeight: '900' },
  flowTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 30, lineHeight: 38, letterSpacing: -0.7, marginTop: 7 },
  flowDescription: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 7 },
  demoFillButton: { minHeight: 94, borderWidth: 1, borderColor: C.line, borderRadius: 8, backgroundColor: '#FBF7F1', paddingHorizontal: 16, paddingVertical: 14, marginBottom: 18, flexDirection: 'row', alignItems: 'center' },
  demoFillButtonLoaded: { borderColor: C.green, backgroundColor: '#EEF0E8' },
  demoFillCopy: { flex: 1, paddingRight: 14 },
  demoFillEyebrow: { color: C.orange, fontSize: 9, letterSpacing: 1.5, fontWeight: '900' },
  demoFillTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 17, marginTop: 4 },
  demoFillHint: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  demoFillArrow: { color: C.orange, fontFamily: 'Georgia', fontSize: 24 },
  recipePhotoPicker: { width: '100%', minHeight: 166, borderRadius: 8, overflow: 'hidden', backgroundColor: C.cream },
  recipePhoto: { width: '100%', height: 180 },
  photoPlaceholder: { minHeight: 166, alignItems: 'center', justifyContent: 'center', padding: 20 },
  photoPlaceholderIcon: { color: C.orange, fontSize: 28 },
  photoPlaceholderTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 14, marginTop: 8 },
  photoPlaceholderHint: { color: C.muted, fontSize: 9, marginTop: 5 },
  photoRemove: { alignSelf: 'flex-end', paddingVertical: 9 },
  photoRemoveText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  sectionQuestion: { color: C.ink, fontFamily: 'Georgia', fontSize: 17, marginTop: 16 },
  sectionHint: { color: C.muted, fontSize: 11, lineHeight: 18, marginTop: 6, marginBottom: 2 },
  formGroupHeader: { borderLeftWidth: 3, borderColor: C.orange, paddingLeft: 10, marginTop: 5 },
  formGroupEyebrow: { color: C.orange, fontSize: 8, letterSpacing: 1.4, fontWeight: '900' },
  formGroupTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 19, marginTop: 2 },
  groupDivider: { height: 1, backgroundColor: C.line, marginVertical: 26 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  inlineField: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  quickChoiceLabel: { color: C.muted, fontSize: 9, fontWeight: '700', marginTop: 10 },
  tipCard: { backgroundColor: C.orangeSoft, borderRadius: 6, padding: 14, marginTop: 18 },
  tipTitle: { color: C.orange, fontSize: 9, fontWeight: '900' },
  tipText: { color: C.ink, fontSize: 11, lineHeight: 17, marginTop: 5 },
  formEyebrow: { color: C.orange, fontSize: 10, letterSpacing: 1.7, fontWeight: '900', marginTop: 8 },
  formTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 31, lineHeight: 39, letterSpacing: -0.7, marginTop: 10 },
  formIntro: { color: C.muted, fontSize: 12, marginTop: 9, marginBottom: 8 },
  logoPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: 8, padding: 14, marginTop: 22, marginBottom: 5 },
  logoPreview: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  logoPreviewText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  logoPickerTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  logoPickerHint: { color: C.muted, fontSize: 10, marginTop: 4 },
  fieldWrap: { marginTop: 18 },
  fieldLabel: { color: C.ink, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  field: { minHeight: 52, borderRadius: 7, borderWidth: 1, borderColor: C.line, backgroundColor: '#FBF7F1', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  fieldMultiline: { height: 96, alignItems: 'flex-start', paddingTop: 13 },
  fieldPrefix: { color: C.muted, fontSize: 14, marginRight: 3 },
  fieldInput: { flex: 1, color: C.ink, fontSize: 14, paddingVertical: 0 },
  fieldInputMultiline: { height: 68, textAlignVertical: 'top', paddingTop: 0 },
  errorText: { color: C.orange, fontSize: 11, fontWeight: '700', marginTop: 14 },
  formSubmit: { height: 56, borderRadius: 8, backgroundColor: C.orange, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 },
  formSubmitText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  formSubmitArrow: { color: '#fff', fontSize: 19 },
  cafeByline: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  bylineLogo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  bylineLogoText: { color: '#fff', fontWeight: '900' },
  bylineText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  groupLabel: { color: C.ink, fontFamily: 'Georgia', fontSize: 16, marginTop: 25 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  choiceChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 5, borderWidth: 1, borderColor: C.line, backgroundColor: 'transparent' },
  choiceChipActive: { backgroundColor: C.ink },
  choiceChipText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  choiceChipTextActive: { color: '#fff' },
  roastRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, marginTop: 8 },
  roastChoice: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderColor: 'transparent' },
  roastChoiceActive: { borderColor: C.orange },
  roastChoiceText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  roastChoiceTextActive: { color: C.ink },
  gridFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 13 },
  miniField: { width: '48%', backgroundColor: '#FBF7F1', borderWidth: 1, borderColor: C.line, borderRadius: 7, paddingHorizontal: 13, paddingVertical: 11 },
  miniLabel: { color: C.muted, fontSize: 9 },
  miniInput: { color: C.ink, fontSize: 15, fontWeight: '900', padding: 0, marginTop: 4 },
  stepsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  stepsHint: { color: C.muted, fontSize: 9, marginTop: 4 },
  stepsCount: { borderBottomWidth: 1, borderColor: C.orange, paddingHorizontal: 2, paddingVertical: 5 },
  stepsCountText: { color: C.orange, fontSize: 9, fontWeight: '800' },
  stepList: { gap: 10, marginTop: 12 },
  emptySteps: { alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 8, padding: 20, marginTop: 12 },
  emptyStepsIcon: { fontSize: 25 },
  emptyStepsTitle: { color: C.ink, fontSize: 12, fontWeight: '900', marginTop: 7 },
  emptyStepsHint: { color: C.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  stepCard: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: C.line, paddingVertical: 12 },
  stepNumber: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  timerNumber: { backgroundColor: C.orangeSoft },
  stepNumberText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  timerNumberText: { color: C.orange, fontSize: 15 },
  stepCopy: { flex: 1, marginLeft: 11 },
  stepKind: { color: C.orange, fontSize: 8, fontWeight: '800' },
  stepTitle: { color: C.ink, fontSize: 12, fontWeight: '800', marginTop: 3 },
  stepValue: { color: C.muted, fontSize: 9, marginTop: 3 },
  stepMediaLabel: { color: C.green, fontSize: 9, fontWeight: '800', marginTop: 5 },
  removeStep: { color: C.muted, fontSize: 22, paddingHorizontal: 7 },
  stepComposer: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, marginTop: 12, backgroundColor: '#FBF7F1' },
  composerTitle: { color: C.ink, fontSize: 12, fontWeight: '900', marginBottom: 10 },
  stepTypeRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line },
  stepType: { flex: 1, alignItems: 'center', paddingVertical: 9, borderBottomWidth: 2, borderColor: 'transparent' },
  stepTypeActive: { borderColor: C.orange },
  stepTypeText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  stepTypeTextActive: { color: C.ink },
  stepInput: { height: 48, color: C.ink, fontSize: 12, borderBottomWidth: 1, borderColor: C.line, marginTop: 6 },
  stepMediaButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stepMediaButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingVertical: 10 },
  stepMediaButtonText: { color: C.ink, fontSize: 10, fontWeight: '800' },
  stepMediaPreview: { position: 'relative', marginTop: 10 },
  stepMediaImage: { width: '100%', height: 150, borderRadius: 6 },
  stepVideoPreview: { height: 100, borderRadius: 6, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 6 },
  stepVideoIcon: { color: '#fff', fontSize: 24 },
  stepVideoText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepMediaRemove: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(32,27,24,.78)', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6 },
  stepMediaRemoveText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  stepComposerBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  stepValueInput: { flex: 1, height: 40, color: C.ink, fontSize: 11 },
  addStepButton: { backgroundColor: C.ink, borderRadius: 6, paddingHorizontal: 13, paddingVertical: 10 },
  addStepButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  reviewCard: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14, backgroundColor: '#FBF7F1' },
  reviewPhoto: { width: '100%', height: 180, borderRadius: 6 },
  reviewPhotoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.cream },
  reviewPhotoEmptyText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  reviewTitle: { color: C.ink, fontFamily: 'Georgia', fontSize: 24, lineHeight: 31, marginTop: 16 },
  reviewDescription: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 6 },
  reviewTools: { borderTopWidth: 1, borderColor: C.line, paddingVertical: 12, marginTop: 14 },
  reviewToolsValue: { color: C.ink, fontSize: 12, fontWeight: '800', marginTop: 4 },
  reviewBean: { backgroundColor: C.orangeSoft, borderRadius: 6, padding: 13, marginTop: 14 },
  reviewBeanProduct: { color: C.ink, fontSize: 15, fontWeight: '900', marginTop: 4 },
  reviewBeanMeta: { color: C.muted, fontSize: 10, marginTop: 5 },
  reviewStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 },
  reviewStat: { minWidth: '18%', flexGrow: 1, borderTopWidth: 1, borderColor: C.line, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 10 },
  reviewStatValue: { color: C.ink, fontSize: 11, fontWeight: '900' },
  reviewStatLabel: { color: C.muted, fontSize: 8, marginTop: 3 },
  reviewDivider: { height: 1, backgroundColor: C.line, marginVertical: 17 },
  reviewStepsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewStepsTitle: { color: C.ink, fontSize: 14, fontWeight: '900' },
  reviewStep: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line },
  reviewStepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  reviewStepNumberText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  flowActions: { flexDirection: 'row', gap: 10, marginTop: 26 },
  flowBackButton: { minWidth: 92, height: 56, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  flowBackText: { color: C.ink, fontSize: 12, fontWeight: '800' },
  flowNextButton: { flex: 1, minWidth: 0, height: 56, borderRadius: 8, backgroundColor: C.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  flowNextDisabled: { opacity: 0.42 },
  flowNextText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  publishButton: { height: 58, borderRadius: 8, backgroundColor: C.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 28 },
  publishButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  publishArrow: { color: '#fff', fontSize: 20 },
  publishNotice: { color: C.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 10 },
});
