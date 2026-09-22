export type StorageBucket = 'recipe-media-private' | 'recipe-images';
export type StepMedia = { type: 'image' | 'video'; uri: string; duration?: number; storagePath?: string; storageBucket?: StorageBucket };
export type Step = { id: string; type: 'action' | 'timer'; title: string; value: string; media?: StepMedia };
export type RoastLevel = '라이트' | '미디엄' | '다크';
export type BeanRecommendation = { product: string; roaster?: string; origin?: string; process?: string; roast?: RoastLevel; dose: string; note?: string };
export type Cafe = { id: string; name: string; handle: string; bio: string; color: string };
export type Recipe = { id: string; title: string; description: string; equipment: string; beans: string; bean?: BeanRecommendation; baseVolumeMl: number; water: string; temperature: string; duration: string; steps: Step[]; publishedAt: string; photo?: string; photoStoragePath?: string; photoStorageBucket?: StorageBucket; cafeId?: string };
export type Review = { id: string; recipeId: string; title: string; rating: number; note: string; date: string };
export type Data = { cafe: Cafe | null; recipes: Recipe[]; draft: Recipe | null; saved: string[]; following: string[]; reviews: Review[]; name: string; active: boolean; legalAcceptedAt: string; termsAcceptedAt: string; privacyAcceptedAt: string; overseasTransferAcceptedAt: string; ageConfirmedAt: string };
export const emptyData: Data = { cafe: null, recipes: [], draft: null, saved: [], following: [], reviews: [], name: '', active: false, legalAcceptedAt: '', termsAcceptedAt: '', privacyAcceptedAt: '', overseasTransferAcceptedAt: '', ageConfirmedAt: '' };
export function seconds(value: string): number {
  const text = value.trim();
  const hours=/^(\d+(?:\.\d+)?)시간$/.exec(text);
  if(hours)return Math.round(parseFloat(hours[1])*3600);
  if (/^\d{1,2}:[0-5]\d$/.test(text)) { const [m, s] = text.split(':').map(Number); return m * 60 + s; }
  if (!/^\d+(초|s)?$/.test(text)) return 0;
  return parseInt(text, 10);
}
export function normalizeRecipe(recipe: Recipe): Recipe {
  const fallback = parseFloat(recipe.water) || 300;
  const baseVolumeMl = Number(recipe.baseVolumeMl);
  return { ...recipe, baseVolumeMl: Number.isFinite(baseVolumeMl) && baseVolumeMl > 0 ? baseVolumeMl : fallback };
}
export function scaleRecipe(recipe: Recipe, targetVolumeMl: number) {
  const normalized = normalizeRecipe(recipe);
  const scale = targetVolumeMl / normalized.baseVolumeMl;
  return {
    scale,
    beansG: Math.round(parseFloat(normalized.beans) * scale * 10) / 10,
    waterG: Math.round(parseFloat(normalized.water) * scale * 10) / 10,
  };
}
export function validateRecipe(r: Recipe): string | null {
  if (!r.title.trim() || !r.description.trim()) return '제목과 설명을 입력해 주세요.';
  if (!Number.isFinite(Number(r.baseVolumeMl)) || Number(r.baseVolumeMl) <= 0) return '기준 컵 사이즈를 입력해 주세요.';
  if (![r.beans, r.water, r.temperature].every(x => Number.isFinite(parseFloat(x)) && parseFloat(x) > 0)) return '원두량, 물의 양, 온도에 양수를 입력해 주세요.';
  if (r.bean && !r.bean.product.trim()) return '추천 원두 제품명을 입력해 주세요.';
  if (!seconds(r.duration)) return '추출 시간은 2:30 또는 150초 형식으로 입력해 주세요.';
  if (!r.steps.length) return '추출 단계를 하나 이상 추가해 주세요.';
  if (r.steps.some(s => !s.title.trim())) return '모든 단계에 설명이 필요해요.';
  if (r.steps.some(s => s.type === 'timer' && (seconds(s.value) < 1 || seconds(s.value) > 3600))) return '대기 시간은 1~3600초로 입력해 주세요.';
  return null;
}
export type Route = { screen: 'home' | 'search' | 'saved' | 'profile' | 'cafe' | 'detail' | 'brew' | 'review' | 'createCafe' | 'editor' | 'settings' | 'legal'; id?: string };
export function back(stack: Route[]): Route[] {
  if (stack.at(-1)?.screen === 'cafe') {
    const index = stack.findLastIndex(r => ['home','search','saved','profile'].includes(r.screen));
    return index < 0 ? [{screen:'home'}] : stack.slice(0, index + 1);
  }
  return stack.length > 1 ? stack.slice(0, -1) : [{ screen: 'home' }];
}
export const sampleCafes: Cafe[] = [
  { id:'sample-a', name:'오후의 Cafe', handle:'afternoon', bio:'집에서 내리는 한 잔. 산뜻한 단맛을 함께 찾아요.', color:'#64745C' },
  { id:'sample-b', name:'Daily Brew', handle:'dailybrew', bio:'매일 마시기 좋은 커피 레시피를 기록합니다.', color:'#98634D' },
];
export const sampleRecipes: Recipe[] = [
  { id:'sample-v60', cafeId:'sample-a', title:'복숭아처럼 산뜻한 V60', description:'일정한 물줄기로 깨끗한 단맛을 살려 보세요. 예시 레시피입니다.', equipment:'V60', beans:'20g', bean:{product:'케냐 키암부 AA',roaster:'오후의 로스터스',origin:'케냐 키암부',process:'워시드',roast:'라이트',dose:'20g'}, baseVolumeMl:300, water:'300g', temperature:'92°C', duration:'2:30', publishedAt:'2026-09-01', steps:[
    {id:'1',type:'action',title:'원두를 중간 굵기로 분쇄하세요',value:'20g'},
    {id:'2',type:'action',title:'필터를 린싱하고 물을 버리세요',value:''},
    {id:'3',type:'action',title:'원두를 넣고 물을 고르게 부어 주세요',value:'40g'},
    {id:'4',type:'timer',title:'뜸을 들여 주세요',value:'30초'},
    {id:'5',type:'action',title:'누적 180g까지 천천히 부어 주세요',value:'180g'},
    {id:'6',type:'timer',title:'물이 조금 내려가길 기다려요',value:'20초'},
    {id:'7',type:'action',title:'누적 300g까지 붓고 추출을 마무리하세요',value:'300g'},
  ]},
  { id:'sample-aero', cafeId:'sample-b', title:'부드러운 아침 에어로프레스', description:'짧은 침출로 부드러운 한 잔을 만들어요. 예시 레시피입니다.', equipment:'에어로프레스', beans:'18g', bean:{product:'콜롬비아 핑크 버번',roaster:'Daily Brew',origin:'콜롬비아 나리뇨',process:'내추럴',roast:'미디엄',dose:'18g'}, baseVolumeMl:220, water:'220g', temperature:'90°C', duration:'2:00', publishedAt:'2026-09-02', steps:[
    {id:'1',type:'action',title:'필터를 끼우고 원두를 넣어 주세요',value:'18g'},
    {id:'2',type:'action',title:'물을 붓고 가볍게 저어 주세요',value:'220g'},
    {id:'3',type:'timer',title:'커피를 우려 주세요',value:'60초'},
    {id:'4',type:'action',title:'천천히 눌러 추출을 마무리하세요',value:''},
  ]},
];
