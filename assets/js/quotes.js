/* ==========================================================================
   Kris — 首屏短句
   有原始语言的用原文，点一下溶解成中文。
   lang: 原文语言；zh 为中文译文（没有 zh 表示本来就是中文）。
   ========================================================================== */

window.KRIS_QUOTES = [
  /* ---------- 古典 ---------- */
  { text: '行到水穷处，坐看云起时', author: '王维', source: '《终南别业》' },
  { text: '明月松间照，清泉石上流', author: '王维', source: '《山居秋暝》' },
  { text: '人闲桂花落，夜静春山空', author: '王维', source: '《鸟鸣涧》' },
  { text: '江流天地外，山色有无中', author: '王维', source: '《汉江临泛》' },
  { text: '春潮带雨晚来急，野渡无人舟自横', author: '韦应物', source: '《滁州西涧》' },
  { text: '孤舟蓑笠翁，独钓寒江雪', author: '柳宗元', source: '《江雪》' },
  { text: '众鸟高飞尽，孤云独去闲', author: '李白', source: '《独坐敬亭山》' },
  { text: '星垂平野阔，月涌大江流', author: '杜甫', source: '《旅夜书怀》' },
  { text: '一蓑烟雨任平生', author: '苏轼', source: '《定风波》' },
  { text: '也无风雨也无晴', author: '苏轼', source: '《定风波》' },
  { text: '人生如逆旅，我亦是行人', author: '苏轼', source: '《临江仙》' },
  { text: '小舟从此逝，江海寄余生', author: '苏轼', source: '《临江仙》' },
  { text: '采菊东篱下，悠然见南山', author: '陶渊明', source: '《饮酒》' },
  { text: '云无心以出岫，鸟倦飞而知还', author: '陶渊明', source: '《归去来兮辞》' },
  { text: '年年岁岁花相似，岁岁年年人不同', author: '刘希夷', source: '《代悲白头翁》' },
  { text: '后之视今，亦犹今之视昔', author: '王羲之', source: '《兰亭集序》' },
  { text: '天地有大美而不言', author: '庄子', source: '《知北游》' },
  { text: '无可奈何花落去，似曾相识燕归来', author: '晏殊', source: '《浣溪沙》' },
  { text: '小楼一夜听春雨，深巷明朝卖杏花', author: '陆游', source: '《临安春雨初霁》' },
  { text: '疏影横斜水清浅，暗香浮动月黄昏', author: '林逋', source: '《山园小梅》' },

  /* ---------- 中国现当代 ---------- */
  { text: '黑夜给了我黑色的眼睛，我却用它寻找光明', author: '顾城', source: '《一代人》' },
  { text: '我有一所房子，面朝大海，春暖花开', author: '海子', source: '《面朝大海，春暖花开》' },
  { text: '一个人只拥有此生此世是不够的，他还应该拥有诗意的世界', author: '王小波', source: '《万寿寺》' },
  { text: '岁月不饶人，我亦未曾饶过岁月', author: '木心', source: '《云雀叫了一整天》' },
  { text: '因为懂得，所以慈悲', author: '张爱玲', source: '' },
  { text: '于千万人之中遇见你所要遇见的人', author: '张爱玲', source: '《爱》' },
  { text: '此心光明，亦复何言', author: '王阳明', source: '' },

  /* ---------- 外国：原文 + 译文 ---------- */
  {
    lang: 'de',
    text: 'Wovon man nicht sprechen kann, darüber muss man schweigen.',
    zh: '凡是不可言说的，必须保持沉默。',
    author: '维特根斯坦', source: '《逻辑哲学论》'
  },
  {
    lang: 'de',
    text: 'Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.',
    zh: '我的语言的界限，意味着我的世界的界限。',
    author: '维特根斯坦', source: '《逻辑哲学论》'
  },
  {
    lang: 'de',
    text: 'Die Sprache ist das Haus des Seins.',
    zh: '语言是存在之家。',
    author: '海德格尔', source: '《关于人道主义的书信》'
  },
  {
    lang: 'de',
    text: 'Wer ein Warum zu leben hat, erträgt fast jedes Wie.',
    zh: '一个人知道自己为什么而活，就几乎能忍受任何一种活法。',
    author: '尼采', source: '《偶像的黄昏》'
  },
  {
    lang: 'de',
    text: 'Wer mit Ungeheuern kämpft, mag zusehen, dass er nicht dabei zum Ungeheuer wird.',
    zh: '与怪物搏斗的人，要当心自己别变成怪物。',
    author: '尼采', source: '《善恶的彼岸》'
  },
  {
    lang: 'de',
    text: 'Das Leben pendelt also zwischen Schmerz und Langeweile.',
    zh: '人生就在痛苦与无聊之间来回摆动。',
    author: '叔本华', source: '《作为意志和表象的世界》'
  },
  {
    lang: 'fr',
    text: 'Je pense, donc je suis.',
    zh: '我思故我在。',
    author: '笛卡尔', source: '《方法论》'
  },
  {
    lang: 'fr',
    text: "L'homme n'est qu'un roseau, le plus faible de la nature ; mais c'est un roseau pensant.",
    zh: '人只是一根芦苇，自然界最脆弱的东西；但他是一根会思想的芦苇。',
    author: '帕斯卡', source: '《思想录》'
  },
  {
    lang: 'fr',
    text: "Tout le malheur des hommes vient d'une seule chose, qui est de ne savoir pas demeurer en repos dans une chambre.",
    zh: '人的一切不幸都源于一件事：不知道如何安静地待在自己的房间里。',
    author: '帕斯卡', source: '《思想录》'
  },
  {
    lang: 'fr',
    text: 'Il faut imaginer Sisyphe heureux.',
    zh: '必须想象西西弗是幸福的。',
    author: '加缪', source: '《西西弗神话》'
  },
  {
    lang: 'fr',
    text: "Au milieu de l'hiver, j'apprenais enfin qu'il y avait en moi un été invincible.",
    zh: '在隆冬，我终于知道，我身上有一个不可战胜的夏天。',
    author: '加缪', source: '《重返蒂巴萨》'
  },
  {
    lang: 'fr',
    text: "L'existence précède l'essence.",
    zh: '存在先于本质。',
    author: '萨特', source: '《存在主义是一种人道主义》'
  },
  {
    lang: 'da',
    text: 'Livet forstås baglæns, men må leves forlæns.',
    zh: '生活只能倒着被理解，却必须正着被经历。',
    author: '克尔凯郭尔', source: '《日记》'
  },
  {
    lang: 'en',
    text: 'The safest general characterization of the European philosophical tradition is that it consists of a series of footnotes to Plato.',
    zh: '对欧洲哲学传统最稳妥的概括是：它由一连串对柏拉图的脚注构成。',
    author: '怀特海', source: '《过程与实在》'
  },
  {
    lang: 'en',
    text: 'We are all in the gutter, but some of us are looking at the stars.',
    zh: '我们都身处阴沟，但仍有人仰望星空。',
    author: '王尔德', source: '《温德米尔夫人的扇子》'
  },
  {
    lang: 'de',
    text: 'Wer spricht von Siegen? Überstehn ist alles.',
    zh: '谁谈得上胜利？挺住就是一切。',
    author: '里尔克', source: '《安魂曲》'
  },
  {
    lang: 'en',
    text: 'I went to the woods because I wished to live deliberately.',
    zh: '我步入丛林，因为我希望活得从容。',
    author: '梭罗', source: '《瓦尔登湖》'
  }
];
