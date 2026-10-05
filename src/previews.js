/* Text and file paths for the independent PNG previews in assets/previews/. */
export const BUILD_BLURBS={
 hq:'岛上最大的甩锅中心：矿、炮、船全归它管，升级后还能合法扩编。',
 gunboat:'停在深水区的移动钱包兼火力客服：等级越高，开场能量越足。',
 gold:'把石头耐心劝成金币；现场仓库塞满就当场下班。',
 wood:'树进去，木材出来；堆不下就先在院子里装没看见。',
 steel:'把矿烧到服气才叫钢；总仓爆满时，货先赖在厂里。',
 store:'老存档留下的万能杂物间：什么都能塞，就是不再招新人。',
 gold_store:'金币的单间宿舍：只收金色住户，升级以后床位更多。',
 wood_store:'木材专属停车楼：别的资源来了也得自己找地方。',
 steel_store:'钢材的重装仓库：门很硬，里面的货更硬。',
 vault:'资源进门先上保险：三种都能放，还能让掠夺者少拿一点。',
 sniper:'别人还没看清塔，它先替对方扣血；单体稳定，脾气很直。',
 mg:'把整条路打成“施工中请绕行”；越远越容易把子弹寄错地址。',
 mortar:'不跟人讲直线，只讲抛物线；靠得太近反而不知道怎么打。',
 cannon:'坦克看见它会重新规划路线；射得不快，但每句话都很重。',
 rocket:'四发一起开会，远处意见容易散；贴得太近又拒绝发言。',
 drone:'不排队，也不认前排后排：随机挑一位送手雷，一趟一枚，送完回家装填。',
 missile:'九秒只想一件事：让装甲单位后悔出门。照样就近锁敌，不接受插队。'
};
export const UNIT_BLURBS={
 rifle:'便宜、好养，人数一多就能把外围建筑围成待拆快递。',
 heavy:'血条比话多，负责站在最前面替全队接收差评。',
 rocket:'本人像纸，火箭筒像老板；躲在后排专拆难啃的建筑。',
 tank:'走路像周一早晨，开炮像月底催款；慢，但谁都不想挨。',
 medic:'不拆楼，只在后排追着红血条跑；同事没事就是他的 KPI。'
};
export const LANDING_CRAFT_BLURB='海上的单程电梯：整船只认一种兵，把大家送到同一片沙滩；跳板一放，后面的事归陆军。';
// Independent raster previews live in assets/previews/.
export const LEVEL_PREVIEW_TYPES=["sniper", "mg", "mortar", "cannon", "rocket", "missile", "drone", "hq", "gold", "wood", "steel", "gold_store", "wood_store", "steel_store", "vault", "store", "gunboat", "landing_craft"];
export function cardPreview(type,unit=false,level=1){
 if(!unit&&LEVEL_PREVIEW_TYPES.includes(type)){let n=Math.max(1,Math.min(10,Math.trunc(Number(level)||1)));return `assets/previews/buildings/${type}-lv${n}.png`}
 if(!unit&&type==='landing_craft')return 'assets/previews/buildings/landing_craft.png';
 const names=unit?UNIT_BLURBS:BUILD_BLURBS;
 if(!Object.hasOwn(names,type))throw Error('Unknown preview: '+type);
 return 'assets/previews/'+(unit?'units':'buildings')+'/'+type+'.png';
}
