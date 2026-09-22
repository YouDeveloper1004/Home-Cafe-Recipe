import { Image } from 'react-native';
import { Asset } from 'expo-asset';
import { Recipe, Step } from './domain';

const covers = [
  require('./assets/seed-recipes/01-peach-v60.jpg'),
  require('./assets/seed-recipes/02-floral-origami.jpg'),
  require('./assets/seed-recipes/03-aeropress.jpg'),
  require('./assets/seed-recipes/04-french-press.jpg'),
  require('./assets/seed-recipes/05-iced-v60.jpg'),
  require('./assets/seed-recipes/06-cold-brew.jpg'),
  require('./assets/seed-recipes/07-moka-pot.jpg'),
  require('./assets/seed-recipes/08-kalita-wave.jpg'),
  require('./assets/seed-recipes/09-espresso.jpg'),
  require('./assets/seed-recipes/10-cafe-au-lait.jpg'),
];

let preparedCovers:string[]|null=null;
function cover(index:number) { return preparedCovers?.[index] ?? Image.resolveAssetSource?.(covers[index])?.uri ?? ''; }

export async function loadOfficialSeedRecipes(cafeId:string):Promise<Recipe[]> {
  const assets=await Promise.all(covers.map(async moduleId=>{
    const asset=Asset.fromModule(moduleId);
    // Android release builds initially expose bundled drawables as resource names.
    // Copy them into the app cache so upload APIs receive actual files.
    if(!asset.localUri?.startsWith('file:')){
      asset.downloaded=false;
      asset.localUri=null;
      await asset.downloadAsync();
    }
    return asset;
  }));
  preparedCovers=assets.map(asset=>asset.localUri ?? asset.uri);
  if(preparedCovers.some(uri=>!uri?.startsWith('file:')))throw new Error('표지 이미지를 기기에 준비하지 못했어요.');
  return officialSeedRecipes(cafeId);
}
function steps(items:Array<[type:'action'|'timer',title:string,value?:string]>):Step[] {
  return items.map(([type,title,value=''],index)=>({id:`seed-step-${index+1}`,type,title,value}));
}

export function officialSeedRecipes(cafeId:string):Recipe[] {
  const publishedAt=new Date().toISOString();
  return [
    {id:'official-seed-01',cafeId,title:'복숭아 향을 살린 데일리 V60',description:'밝은 산미와 복숭아 같은 단맛이 또렷하게 이어지는 균형 잡힌 핸드드립이에요.',equipment:'V60',beans:'20g',bean:{product:'에티오피아 구지 내추럴',roaster:'Bean Chillin 셀렉션',origin:'에티오피아 구지',process:'내추럴',roast:'라이트',dose:'20g'},baseVolumeMl:300,water:'300g',temperature:'92°C',duration:'2:40',photo:cover(0),publishedAt,steps:steps([
      ['action','필터를 린싱하고 서버의 물을 비워 주세요'],['action','중간보다 조금 가늘게 간 원두를 평평하게 담아 주세요','20g'],['action','전체가 젖도록 중심부터 부어 주세요','45g'],['timer','가스가 빠지며 향이 열리도록 기다려요','35초'],['action','작은 원을 그리며 누적 170g까지 부어 주세요','170g'],['timer','물 높이가 절반으로 내려가길 기다려요','20초'],['action','누적 300g까지 부은 뒤 가볍게 흔들어 마무리하세요','300g'],
    ])},
    {id:'official-seed-02',cafeId,title:'꽃향이 맑게 피는 오리가미',description:'워시드 케냐의 꽃향과 붉은 과일 인상을 깨끗한 여운으로 표현하는 레시피예요.',equipment:'오리가미',beans:'18g',bean:{product:'케냐 키리냐가 워시드',roaster:'Bean Chillin 셀렉션',origin:'케냐 키리냐가',process:'워시드',roast:'라이트',dose:'18g'},baseVolumeMl:270,water:'270g',temperature:'93°C',duration:'2:25',photo:cover(1),publishedAt,steps:steps([
      ['action','필터를 린싱하고 원두를 중간 굵기로 분쇄해 주세요','18g'],['action','드리퍼를 흔들어 커피층을 평평하게 정리해 주세요'],['action','중심부터 45g을 부어 모든 원두를 적셔 주세요','45g'],['timer','뜸을 들이며 향을 열어 주세요','30초'],['action','두 번에 나누어 누적 270g까지 부어 주세요','270g'],['action','드리퍼의 물이 빠지면 서버를 가볍게 돌려 완성하세요'],
    ])},
    {id:'official-seed-03',cafeId,title:'초콜릿처럼 부드러운 에어로프레스',description:'짧은 침출과 부드러운 압력으로 초콜릿과 견과류 같은 단맛을 살렸어요.',equipment:'에어로프레스',beans:'17g',bean:{product:'브라질 세하도 펄프드 내추럴',roaster:'Bean Chillin 셀렉션',origin:'브라질 세하도',process:'펄프드 내추럴',roast:'미디엄',dose:'17g'},baseVolumeMl:220,water:'220g',temperature:'88°C',duration:'1:45',photo:cover(2),publishedAt,steps:steps([
      ['action','필터를 린싱하고 에어로프레스를 정방향으로 준비하세요'],['action','중간보다 곱게 간 원두를 넣고 물을 빠르게 부어 주세요','220g'],['action','앞뒤로 세 번 천천히 저어 주세요','3회'],['timer','커피가 충분히 우러나도록 기다려요','60초'],['action','약 30초 동안 일정한 힘으로 천천히 눌러 주세요','30초'],
    ])},
    {id:'official-seed-04',cafeId,title:'아침을 위한 클린 프렌치프레스',description:'긴 침출 뒤 표면의 미분을 걷어 내 묵직하지만 텁텁하지 않은 한 잔을 만들어요.',equipment:'프렌치프레스',beans:'24g',bean:{product:'과테말라 안티구아',roaster:'Bean Chillin 셀렉션',origin:'과테말라 안티구아',process:'워시드',roast:'미디엄',dose:'24g'},baseVolumeMl:360,water:'360g',temperature:'94°C',duration:'5:00',photo:cover(3),publishedAt,steps:steps([
      ['action','굵게 간 원두를 프렌치프레스에 담고 물을 모두 부어 주세요','360g'],['timer','커피가 충분히 우러나도록 그대로 기다려요','240초'],['action','표면의 커피층을 가볍게 깨고 거품과 미분을 걷어 주세요'],['timer','플런저를 수면에 걸친 채 커피가 맑아지도록 기다려요','60초'],
    ])},
    {id:'official-seed-05',cafeId,title:'레몬처럼 상쾌한 아이스 V60',description:'진하게 추출한 커피를 얼음 위로 바로 식혀 산뜻하고 선명한 아이스 커피를 만들어요.',equipment:'V60',beans:'22g',bean:{product:'르완다 니아마셰케 워시드',roaster:'Bean Chillin 셀렉션',origin:'르완다 니아마셰케',process:'워시드',roast:'라이트',dose:'22g'},baseVolumeMl:330,water:'210g',temperature:'93°C',duration:'2:20',photo:cover(4),publishedAt,steps:steps([
      ['action','서버에 단단한 얼음을 준비하고 필터를 린싱해 주세요','120g'],['action','중간보다 가늘게 간 원두를 담아 주세요','22g'],['action','커피층 전체를 적시도록 물을 부어 주세요','45g'],['timer','뜸을 들여 향을 충분히 열어 주세요','35초'],['action','세 번에 나누어 누적 210g까지 부어 주세요','210g'],['action','추출이 끝나면 서버를 돌려 얼음을 완전히 녹여 주세요'],
    ])},
    {id:'official-seed-06',cafeId,title:'밤새 천천히 우린 콜드브루',description:'냉장 침출로 부드러운 단맛을 끌어낸 부담 없는 데일리 콜드브루예요.',equipment:'콜드브루 보틀',beans:'60g',bean:{product:'콜롬비아 우일라',roaster:'Bean Chillin 셀렉션',origin:'콜롬비아 우일라',process:'워시드',roast:'미디엄',dose:'60g'},baseVolumeMl:700,water:'700g',temperature:'20°C',duration:'12시간',photo:cover(5),publishedAt,steps:steps([
      ['action','아주 굵게 간 원두를 필터 또는 용기에 담아 주세요','60g'],['action','찬물을 붓고 마른 원두가 없도록 부드럽게 저어 주세요','700g'],['action','뚜껑을 닫아 냉장고에서 천천히 우려 주세요','12시간'],['action','필터를 제거하고 깨끗한 병에 옮겨 차갑게 즐기세요'],
    ])},
    {id:'official-seed-07',cafeId,title:'카라멜 단맛의 모카포트',description:'쓴맛을 줄이고 카라멜 같은 농도와 단맛을 살리는 가정용 모카포트 레시피예요.',equipment:'모카포트',beans:'18g',bean:{product:'브라질·콜롬비아 블렌드',roaster:'Bean Chillin 셀렉션',origin:'브라질·콜롬비아',process:'블렌드',roast:'다크',dose:'18g'},baseVolumeMl:150,water:'150g',temperature:'90°C',duration:'3:30',photo:cover(6),publishedAt,steps:steps([
      ['action','하단 보일러에 안전밸브 아래까지 뜨거운 물을 채워 주세요','150g'],['action','바스켓에 고운 원두를 평평하게 담되 누르지 마세요','18g'],['action','젖은 행주로 보일러를 잡고 상단을 단단히 결합하세요'],['timer','중약불에서 커피가 나오기 시작할 때까지 기다려요','120초'],['action','색이 옅어지기 전에 불에서 내리고 보일러를 식혀 추출을 멈추세요'],
    ])},
    {id:'official-seed-08',cafeId,title:'고소하고 균형 잡힌 칼리타 웨이브',description:'평평한 바닥의 장점을 살려 견과류 같은 단맛과 안정적인 밸런스를 만드는 레시피예요.',equipment:'칼리타 웨이브',beans:'20g',bean:{product:'엘살바도르 파카마라 허니',roaster:'Bean Chillin 셀렉션',origin:'엘살바도르 아파네카',process:'허니',roast:'미디엄',dose:'20g'},baseVolumeMl:300,water:'300g',temperature:'91°C',duration:'2:50',photo:cover(7),publishedAt,steps:steps([
      ['action','웨이브 필터의 모양이 흐트러지지 않게 린싱해 주세요'],['action','중간 굵기의 원두를 평평하게 담아 주세요','20g'],['action','중심부터 50g을 부어 전체를 적셔 주세요','50g'],['timer','커피층이 고르게 부풀도록 기다려요','40초'],['action','수위를 일정하게 유지하며 누적 300g까지 나누어 부어 주세요','300g'],['action','물이 모두 빠지면 서버를 돌려 맛을 고르게 섞어 주세요'],
    ])},
    {id:'official-seed-09',cafeId,title:'단맛 중심의 1:2 에스프레소',description:'기본 1:2 비율로 점도와 단맛, 편안한 산미가 균형을 이루는 에스프레소예요.',equipment:'에스프레소 머신',beans:'18g',bean:{product:'하우스 에스프레소 블렌드',roaster:'Bean Chillin 셀렉션',origin:'브라질·에티오피아',process:'블렌드',roast:'미디엄',dose:'18g'},baseVolumeMl:36,water:'36g',temperature:'93°C',duration:'0:28',photo:cover(8),publishedAt,steps:steps([
      ['action','포터필터를 깨끗이 닦고 곱게 간 원두를 담아 주세요','18g'],['action','원두를 고르게 분배하고 수평으로 탬핑해 주세요'],['action','그룹 헤드를 짧게 플러싱한 뒤 포터필터를 장착하세요'],['timer','36g이 될 때까지 추출해 주세요','28초'],['action','크레마를 한 번 저어 향과 농도를 고르게 만든 뒤 맛보세요','36g'],
    ])},
    {id:'official-seed-10',cafeId,title:'포근한 아침 카페오레',description:'진한 필터 커피와 따뜻한 우유를 같은 비율로 섞어 부드럽고 편안하게 즐겨요.',equipment:'V60, 우유 피처',beans:'20g',bean:{product:'온두라스 코판',roaster:'Bean Chillin 셀렉션',origin:'온두라스 코판',process:'워시드',roast:'미디엄',dose:'20g'},baseVolumeMl:320,water:'160g',temperature:'92°C',duration:'3:00',photo:cover(9),publishedAt,steps:steps([
      ['action','중간보다 가늘게 간 원두로 진한 필터 커피를 추출해 주세요','160g'],['action','우유를 약 60°C까지 데워 가볍게 저어 주세요','160g'],['timer','컵을 뜨거운 물로 예열해 주세요','30초'],['action','커피와 우유를 1:1로 섞어 부드럽게 마무리하세요','320g'],
    ])},
  ];
}
