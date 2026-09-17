const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
const moduleExports={exports:{}};
const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../domain.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module:moduleExports,exports:moduleExports.exports});
const {back,seconds,scaleRecipe,validateRecipe,sampleRecipes}=moduleExports.exports;
test('recipe back reaches Cafe, then exits to home even with old alternating history',()=>{
  let stack=[{screen:'home'},{screen:'detail',id:'one'},{screen:'cafe',id:'a'},{screen:'detail',id:'two'},{screen:'cafe',id:'a'},{screen:'detail',id:'three'}];
  stack=back(stack);assert.equal(stack.at(-1).screen,'cafe');
  stack=back(stack);assert.equal(stack.length,1);assert.equal(stack[0].screen,'home');
});
test('Cafe exit retains search context',()=>{
  const result=back([{screen:'search'},{screen:'cafe',id:'a'}]);assert.equal(result[0].screen,'search');assert.equal(result.length,1);
});
test('timer parser rejects invalid and negative input',()=>{
  assert.equal(seconds('1:30'),90);assert.equal(seconds('30초'),30);assert.equal(seconds('30'),30);
  for(const input of ['-30','3abc','1:99','Infinity',''])assert.equal(seconds(input),0);
});
test('publishing validates all extraction steps',()=>{
  const recipe=sampleRecipes[0];assert.equal(validateRecipe(recipe),null);
  assert.ok(validateRecipe({...recipe,baseVolumeMl:0}));
  assert.ok(validateRecipe({...recipe,steps:[]}));
  assert.ok(validateRecipe({...recipe,water:'0g'}));
  assert.ok(validateRecipe({...recipe,steps:[{id:'x',type:'timer',title:'wait',value:'abc'}]}));
  assert.ok(validateRecipe({...recipe,steps:[{id:'x',type:'timer',title:'wait',value:'3601초'}]}));
});
test('cup size scales beans and water from the recipe base volume',()=>{
  const scaled=scaleRecipe(sampleRecipes[0],450);
  assert.equal(scaled.scale,1.5);assert.equal(scaled.beansG,30);assert.equal(scaled.waterG,450);
});
test('different cards have distinct owners and extraction plans',()=>{
  assert.notEqual(sampleRecipes[0].id,sampleRecipes[1].id);
  assert.notEqual(sampleRecipes[0].cafeId,sampleRecipes[1].cafeId);
  assert.notEqual(sampleRecipes[0].steps.length,sampleRecipes[1].steps.length);
});
