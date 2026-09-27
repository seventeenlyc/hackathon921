const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let path = [{x:20,y:20},{x:100,y:20},{x:100,y:100},{x:20,y:100},{x:20,y:20}];
const draws = [], bars = [];
let unavailable = '';
const ports = {
 '../../interfaces/Renderable': {Renderable: class {constructor(x,y){this.x=x;this.y=y;}}},
 '../../Map': {Map:{TILE_SIZE:40},map:{getPathFromGridCell:()=>path,homeBase:{handleDamage(){}}}},
 '../../config.json': {colors:{enemyBase:{primary:'#f00'}}},
 '../../tools/shapes': {drawRoundedSquare:(...args)=>bars.push(args)},
 '../../CashManager': {cashManager:{add(){}}},
 '../../tools/TextureManager': {textureManager:{draw:(ctx,src,x,y,w,h,r=0)=>{draws.push({src,x,y,w,h,r});return src!==unavailable;}}},
};
const compiled = ts.transpileModule(fs.readFileSync('src/entities/enemies/Enemy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled,{exports:exportsObject,require:p=>{assert.ok(ports[p],p);return ports[p];}});
class TestEnemy extends exportsObject.Enemy {
 texturePath='up.png';
 textureDirections={up:'up.png',right:'right.png',down:'down.png',left:'left.png'};
 speed=2.5;life=50;cash=5;radius=8;
}
const enemy=new TestEnemy({center:{x:20,y:20}});
const ctx={fill(){}};
function drawn(){draws.length=0;enemy.draw(ctx);return draws[0];}
assert.equal(drawn().src,'up.png');
enemy.update();
assert.equal(enemy.x,22.5);assert.equal(enemy.y,20);
assert.equal(drawn().src,'right.png','actual movement selects right sprite');
function advanceTo(x,y){for(let i=0;i<100 && (enemy.x!==x || enemy.y!==y);i++)enemy.update();enemy.update();}
advanceTo(100,20);assert.equal(drawn().src,'down.png');
advanceTo(100,100);assert.equal(drawn().src,'left.png');
advanceTo(20,100);assert.equal(drawn().src,'up.png');
enemy.speed=0;enemy.update();assert.equal(drawn().src,'up.png','stationary retains facing');
path=false;enemy.updatePath();enemy.update();assert.equal(drawn().src,'up.png','no path retains facing');
path=[{x:enemy.x,y:enemy.y},{x:enemy.x-40,y:enemy.y}];
enemy.speed=2.5;enemy.updatePath();enemy.update();assert.equal(drawn().src,'left.png','recomputed path updates facing');
unavailable='left.png';drawn();assert.equal(draws[1].src,'up.png','unloaded direction falls back to loaded base art');
unavailable='';enemy.damageTaken=10;enemy.draw(ctx);assert.equal(bars.length,2,'health bar survives');
assert.equal(enemy.radius,8);assert.equal(enemy.speed,2.5);
delete enemy.textureDirections;assert.equal(drawn().src,'up.png','legacy sprites remain supported');
assert.ok(draws.every(d=>d.r===0),'pre-oriented sprites are never rotated again');
console.log('Enemy four-direction movement, turns, idle, repathing, loading fallback and health-bar tests passed.');
