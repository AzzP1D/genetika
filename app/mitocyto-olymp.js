import * as THREE from 'three';
import { buildRingDetail, buildBridgeDetail } from './mitocyto-geometry.js';
import { rotateAnswers } from './mitoinfo.js';

const RING = [
  {
    title:'Веретено задаёт зону деления',
    text:'В анафазе встречные микротрубочки перекрываются между расходящимися хромосомами. На этих участках накапливается центральспиндлин.',
    detail:'Центральспиндлин состоит из моторного белка MKLP1 (KIF23) и регуляторного белка RACGAP1 (CYK-4). Зона перекрытия задаёт ориентир для экваториальной коры, тонкого слоя цитоплазмы под клеточной мембраной.',
    next:'Привлечь ECT2',
  }, {
    title:'Plk1 создаёт место связывания ECT2',
    text:'Киназа Plk1 фосфорилирует RACGAP1. Фосфатные группы становятся участками, которые распознаёт регулятор ECT2.',
    detail:'BRCT-домены ECT2 распознают фосфорилированный участок RACGAP1. Так сигнал сопрягается с положением веретена. Для включения RhoA важна работа ECT2 у мембраны. Скопление ECT2 на самом веретене — один из способов локализации сигнала.',
    next:'Запустить обмен GDP на GTP',
  }, {
    title:'ECT2 включает RhoA у мембраны',
    text:'ECT2 помогает RhoA отпустить GDP. На освободившееся место связывается GTP, и RhoA становится активным. Активные молекулы образуют узкую экваториальную зону.',
    detail:'ECT2 — фактор обмена гуаниновых нуклеотидов (GEF). Он ускоряет выход GDP. GTP связывается из цитоплазмы. RhoA — малая GTPаза. После гидролиза GTP она возвращается в состояние RhoA–GDP. В модели показан один цикл включения.',
    next:'Собрать актомиозиновый пояс',
  }, {
    title:'RhoA запускает две ветви сигнала',
    text:'Формины помогают удлинять нити актина. Киназа ROCK способствует фосфорилированию лёгких цепей миозина II, повышая его активность. Вместе они создают сократимый пояс.',
    detail:'Формин удерживается у растущего конца актиновой нити и помогает присоединять новые субъединицы. Миозин II связывает нити и за счёт гидролиза ATP сдвигает их друг относительно друга. В коре из этого возникает натяжение, которое углубляет борозду.',
    next:'Проверить прогноз',
  },
];

const BRIDGE = [
  {
    title:'CEP55 собирается у срединного тельца',
    text:'Узкая перемычка ещё соединяет две клетки. В её центре остаётся перекрытие микротрубочек. Когда активность Plk1 снижается, у срединного тельца накапливается CEP55.',
    detail:'Центральная плотная область называется срединным тельцем. Это площадка сборки белков для абсциссии, окончательного разделения мостика. Сам разрыв мембраны в показанном примере возникнет сбоку от неё.',
    next:'Привлечь адаптеры',
  }, {
    title:'ALIX и ESCRT-I привлекают ESCRT-III',
    text:'CEP55 связывает ALIX и субъединицу TSG101 комплекса ESCRT-I. Эти пути помогают собрать компоненты ESCRT-III.',
    detail:'Через ALIX и через ESCRT-I/II компоненты ESCRT-III могут привлекаться параллельно. Для ясности на модели отмечены ALIX и TSG101 по разные стороны от центральной площадки. Их реальное распределение сложнее.',
    next:'Собрать нити ESCRT-III',
  }, {
    title:'ESCRT-III формирует участок сужения',
    text:'Нити ESCRT-III собираются со стороны цитоплазмы и концентрируются у будущего места разделения. Оно расположено сбоку от срединного тельца.',
    detail:'Нити ESCRT-III меняют кривизну мембраны. АТФаза VPS4 перестраивает комплекс, разбирая и перераспределяя его субъединицы. Спираль на схеме показывает, где происходит сужение, и не передаёт точную укладку отдельных белков.',
    next:'Дать спастину разобрать пучок',
  }, {
    title:'Спастин разрезает микротрубочки',
    text:'Спастин действует на зелёный пучок в узком участке. После разрезания концы микротрубочек укорачиваются, и в пучке открывается просвет. Мембрана пока соединена.',
    detail:'Спастин — АТФаза, разрезающая микротрубочки. У места абсциссии её привлекают белки, связанные с ESCRT-III. Поэтому на модели можно увидеть уже освобождённый от микротрубочек, но ещё связанный мембраной участок.',
    next:'Разделить мембрану',
  }, {
    title:'Мембрана разделяется сбоку от тельца',
    text:'ESCRT перестраивает узкую мембранную шейку. После разделения обе клеточные мембраны замкнуты. На модели остаток мостика остаётся у верхней клетки.',
    detail:'В клетках млекопитающих мостик иногда разделяется и по другую сторону срединного тельца. Тогда остаток может высвободиться. Расщепление пучка и разделение мембраны — два разных результата работы комплекса.',
    next:'Проверить прогноз',
  },
];

const EXPERIMENTS = {
  ring: {
    title:'Опыт · выключен ECT2',
    text:'Веретено сформировалось, но ECT2 выключили до появления борозды. Что произойдёт у экватора?',
    answers:[
      ['Активного RhoA будет мало, борозда не начнётся',true,'Верно. При потере ECT2 активный RhoA не накапливается достаточно для запуска борозды. На модели молекулы остаются в состоянии RhoA–GDP.'],
      ['RhoA включится раньше и кольцо стянется быстрее',false,'ECT2 ускоряет включение RhoA, помогая выйти GDP. Без него экваториальный сигнал ослабнет.'],
      ['Исчезнут микротрубочки веретена',false,'Мишень опыта — обмен нуклеотида у RhoA. Центральное веретено в этом опыте уже сформировано.'],
    ],
  },
  bridge: {
    title:'Опыт · спастин выключен',
    text:'ESCRT-III собрался. В месте будущего разделения остался пучок микротрубочек, потому что спастин выключен. Что предсказывает эта модель?',
    answers:[
      ['Пучок сохранится, а разделение мостика задержится',true,'Верно. ESCRT-III может собраться, но без своевременной расчистки пучка разделение затруднено. На модели соединённый мостик сохраняется.'],
      ['ESCRT-III сам сразу разрежет весь пучок',false,'В этой цепочке микротрубочки разрезает спастин. ESCRT-III организует участок и перестраивает мембрану.'],
      ['Борозда исчезнет, ядра снова сольются',false,'Борозда уже углубилась и два ядра сформировались. Вмешательство затрагивает последний шаг — разделение мостика.'],
    ],
  },
};

const SOURCES = {
  ring:'<a href="https://doi.org/10.1371/journal.pbio.1000110" target="_blank" rel="noopener">Plk1, CYK-4 и ECT2</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5177604/" target="_blank" rel="noopener">ECT2 у мембраны</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2366861/" target="_blank" rel="noopener">Формины и актин</a>',
  bridge:'<a href="https://rupress.org/jcb/article/212/5/499/38347/ALIX-and-ESCRT-I-II-function-as-parallel-ESCRT-III" target="_blank" rel="noopener">Как привлекается ESCRT-III</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/21383202/" target="_blank" rel="noopener">ESCRT у места разделения</a> · <a href="https://www.nature.com/articles/s41467-024-46062-9" target="_blank" rel="noopener">Спастин и разрезание микротрубочек</a>',
};

export function createCytoDetail(kind, ctx, {exit, proceed}) {
  const {ui,fly,fit,controls}=ctx;
  const ring=kind==='ring', steps=ring?RING:BRIDGE;
  const visual=(ring?buildRingDetail:buildBridgeDetail)();
  const modelName=ring?'От веретена к кольцу':'Разделение межклеточного мостика';
  const continuation=ring?'Собрать кольцо в клетке':'Разделить клетки';
  let step=0, age=0, blocked=false, answered=false;

  function frame(index, seconds) {
    const {target,radius,direction}=visual.view(index);
    const distance=fit(radius);
    controls.minDistance=.32;
    controls.maxDistance=Math.max(18,distance*1.75);
    fly(target.clone().addScaledVector(new THREE.Vector3(...direction).normalize(),distance),target,seconds);
  }
  function heading(title,text,detail='') {
    const counter=Array.from({length:steps.length+1},(_,i)=>`<i class="${i<step?'done':i===step?'now':''}"></i>`).join('');
    ui.hud(`<section class="cyto-lesson"><div class="cyto-track" aria-label="Шаг ${step+1} из ${steps.length+1}">${counter}<small>${step+1} / ${steps.length+1}</small></div><small>${modelName}</small><b>${title}</b><span>${text}</span>
      <details><summary>${detail?'Разобрать подробнее':'Источники и обозначения'}</summary><div>${detail?`<p>${detail}</p>`:''}<p class="cyto-sources">Учебная модель, размеры и формы комплексов условны.</p><p class="cyto-sources">${SOURCES[kind]}</p></div></details></section>`);
  }
  function draw(k){
    const last=steps.length-1;
    if(step<=last||blocked){visual.show(Math.min(step,last),k,blocked);return;}
    const fraction=.49;
    if(k<fraction)visual.show(last-1,k/fraction,false);
    else visual.show(last,(k-fraction)/(1-fraction),false);
  }
  function play(){age=0;draw(0);}
  function move(to) {
    step=to;blocked=step===steps.length;answered=false;
    ui.label(null);play();render();
    frame(Math.min(step,steps.length-1),.78);
  }
  function render() {
    const back={text:step>0?'Назад':'К клетке',onClick:()=>step>0?move(step-1):exit()};
    if(step<steps.length){
      const item=steps[step];heading(item.title,item.text,item.detail);
      ui.buttons([back,{text:'Повторить шаг',onClick:play},{text:item.next,primary:true,onClick:()=>move(step+1)}],'cyto-controls');
      return;
    }
    const experiment=EXPERIMENTS[kind];
    if(answered){
      heading(blocked?experiment.title:'Контроль · без блокировки',
        blocked?(ring?'Сравни экватор с нормой. Синий цвет обозначает RhoA–GDP.':'Сравни мостик с нормой. Зелёные микротрубочки по-прежнему проходят через шейку.')
          :(ring?'Там же, у экваториальной мембраны, RhoA–GTP запускает сборку актомиозинового пояса.':'В зелёном пучке образуется просвет, затем разделяется мембрана.'));
      ui.buttons([back,{text:blocked?'Показать норму':'Вернуть блокировку',onClick:()=>{
        blocked=!blocked;play();
        ui.label(blocked
          ? (ring?'Опыт. У мембраны остаётся RhoA–GDP, экваториальный пояс не собирается.':'Опыт. Пучок сохраняется и мостик остаётся соединённым.')
          : (ring?'Норма. RhoA–GTP запускает сборку актина и работу миозина.':'Норма. Пучок укорачивается, после чего мембрана разделяется.'));
        render();
      }},{text:continuation,primary:true,onClick:proceed}],'cyto-controls');
      return;
    }
    heading(experiment.title,experiment.text);
    const answers=rotateAnswers(experiment.answers,ring?1:2);
    ui.buttons([...answers.map(([text,correct,feedback])=>({text,onClick:()=>{
      ui.label(feedback);
      if(correct){answered=true;blocked=true;play();render();}
    }})),back],'column cyto-controls',false);
  }
  return {
    group:visual.group,
    get labels(){return visual.labels().slice(0,3);},
    intro(){move(0);},
    update(dt){
      if(step===steps.length&&!answered)return;
      const duration=step===steps.length&&!blocked?4.65:2.25;
      if(age>=duration)return;
      age=Math.min(duration,age+dt);
      draw(age/duration);
    },
  };
}
