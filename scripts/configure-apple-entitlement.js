const fs=require('node:fs');
const path=require('node:path');

if(process.env.EAS_BUILD_PLATFORM&&process.env.EAS_BUILD_PLATFORM!=='ios')process.exit(0);

const entitlementsPath=process.env.RATIO_ENTITLEMENTS_PATH??path.join(process.cwd(),'ios','Cafe','Cafe.entitlements');
const enabled=process.env.EXPO_PUBLIC_APPLE_LOGIN_ENABLED==='true';
const appleBlock=/\s*<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/g;
let source=fs.readFileSync(entitlementsPath,'utf8').replace(appleBlock,'');
if(enabled){
  const block='\n    <key>com.apple.developer.applesignin</key>\n    <array>\n      <string>Default</string>\n    </array>';
  source=source.includes('<dict/>')
    ?source.replace('<dict/>','<dict>'+block+'\n  </dict>')
    :source.replace(/<dict>/,'<dict>'+block);
}
fs.writeFileSync(entitlementsPath,source);
console.log(`Sign in with Apple entitlement: ${enabled?'enabled':'disabled'}`);
