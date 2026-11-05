import type { Passage } from '../index';

export const PASSAGE_023: Passage = {
  id: 'passage-023',
  indexLabel: 'NO. 23',
  topic: '社会生活',
  titleZh: '夜班之后，城市如何送人回家',
  titleEn: 'Getting Home After the Night Shift',
  paragraphs: [
    {
      paragraphNumber: 1,
      sentences: [
        {
          sentenceNumber: 1,
          english:
            'At midnight, a hotel worker leaves the kitchen in an outer district after her shift ends.',
          chinese: '午夜时分，一名酒店员工在轮班结束后离开城市外围一个区的厨房。',
        },
        {
          sentenceNumber: 2,
          english:
            'Her commute begins when the subway has stopped running, while traffic still moves slowly along the main road.',
          chinese: '她开始通勤时，地铁已经停运，而主路上的车流仍在缓慢移动。',
        },
        {
          sentenceNumber: 3,
          english:
            'Trains on the railway run once an hour, but the next one may leave before she reaches a station.',
          chinese: '铁路列车每小时有一班，但下一班可能在她到达车站前就开走。',
        },
      ],
    },
    {
      paragraphNumber: 2,
      sentences: [
        {
          sentenceNumber: 1,
          english:
            'Her wage is low, so she cannot afford a taxi fare every night.',
          chinese: '她的工资很低，所以每晚都负担不起出租车费。',
        },
        {
          sentenceNumber: 2,
          english:
            'Several coworkers face the same gap: their shifts end after the local bus stops running, and the nearest train station is far away.',
          chinese:
            '几位同事也面临同样的交通缺口：他们下班时本地公交已经停运，而最近的火车站又很远。',
        },
        {
          sentenceNumber: 3,
          english:
            'They are not asking for a taxi for every rider; they want a service that links late shifts to the main transit line.',
          chinese:
            '他们并不是要求每位乘客都打车，而是希望有一项服务能把晚班与主要交通干线衔接起来。',
        },
      ],
    },
    {
      paragraphNumber: 3,
      sentences: [
        {
          sentenceNumber: 1,
          english:
            'After workers report the problem, city planners study passenger counts and compare them with shift schedules.',
          chinese: '工人反映问题后，市政规划人员研究客流人数，并将其与轮班时间表进行比较。',
        },
        {
          sentenceNumber: 2,
          english:
            'They test extending subway hours on two busy routes for one month.',
          chinese: '他们在两条繁忙线路上试行延长地铁运营时间，为期一个月。',
        },
        {
          sentenceNumber: 3,
          english:
            'Road traffic remains heavy, but fewer workers miss their train, and fewer have to spend most of their wages on a ride.',
          chinese:
            '试行期间，道路依然拥堵，但错过列车的工人少了，不得不把大部分工资花在乘车上的人也少了。',
        },
      ],
    },
    {
      paragraphNumber: 4,
      sentences: [
        {
          sentenceNumber: 1,
          english:
            'Officials review the cost and assess whether the service can extend to another district without running nearly empty trains.',
          chinese:
            '市政官员会审查成本，并评估这项服务能否延伸到另一个区，同时避免让列车几乎空载运行。',
        },
        {
          sentenceNumber: 2,
          english:
            'A reliable connection is not a special favor; it helps workers reach jobs that keep a city running after dark.',
          chinese:
            '稳定可靠的交通衔接并非特殊照顾；它能帮助工人到岗，维持这座城市入夜后的运转。',
        },
        {
          sentenceNumber: 3,
          english:
            'If the trial succeeds, the city can adjust schedules instead of promising service it cannot sustain.',
          chinese: '如果试行成功，城市就可以调整班次，而不是承诺无法持续的服务。',
        },
      ],
    },
  ],
  wordAnnotations: [
    { headwordId: 'district', gloss: 'n.区；地区' },
    { headwordId: 'shift', gloss: 'n.班次；轮班' },
    { headwordId: 'commute', gloss: 'n.通勤；上下班路程' },
    { headwordId: 'subway', gloss: 'n.地铁；地下铁路' },
    { headwordId: 'traffic', gloss: 'n.交通；车流' },
    { headwordId: 'slow', surface: 'slowly', gloss: 'ad.缓慢地；迟缓地' },
    { headwordId: 'main', gloss: 'a.主要的；最重要的' },
    { headwordId: 'railway', gloss: 'n.铁路；铁道' },
    { headwordId: 'reach', surface: 'reaches', gloss: 'v.到达；够到' },
    { headwordId: 'wage', gloss: 'n.工资；薪金' },
    { headwordId: 'fare', gloss: 'n.车费；票价' },
    { headwordId: 'afford', gloss: 'v.负担得起；买得起' },
    { headwordId: 'several', gloss: 'a.若干的；几个的' },
    {
      kind: 'out-of-syllabus',
      surface: 'coworkers',
      lemma: 'coworker',
      gloss: 'n.同事；共事者',
    },
    { headwordId: 'gap', gloss: 'n.差距；缺口' },
    { headwordId: 'local', gloss: 'a.当地的；本地的' },
    { headwordId: 'ask', surface: 'asking', gloss: 'v.询问；请求' },
    { headwordId: 'want', gloss: 'v.想要；希望' },
    { headwordId: 'serve', surface: 'service', gloss: 'n.服务；公共服务' },
    { headwordId: 'link', surface: 'links', gloss: 'v.连接；衔接' },
    { headwordId: 'transit', gloss: 'a.公共交通的；运输的' },
    { headwordId: 'report', surface: 'report', gloss: 'v.报告；反映' },
    { headwordId: 'problem', gloss: 'n.问题；难题' },
    { headwordId: 'study', gloss: 'v.研究；学习' },
    { headwordId: 'passenger', gloss: 'n.乘客；旅客' },
    { headwordId: 'count', surface: 'counts', gloss: 'n.数目；人数' },
    { headwordId: 'compare', gloss: 'v.比较；对照' },
    { headwordId: 'schedule', surface: 'schedules', gloss: 'n.时间表；安排' },
    { headwordId: 'test', gloss: 'v.试验；测试' },
    { headwordId: 'connect', surface: 'connection', gloss: 'n.连接；衔接' },
    { headwordId: 'busy', gloss: 'a.繁忙的；忙碌的' },
    { headwordId: 'route', surface: 'routes', gloss: 'n.路线；线路' },
    { headwordId: 'trial', gloss: 'n.试验；试行' },
    { headwordId: 'spend', gloss: 'v.花费；度过' },
    { headwordId: 'remain', gloss: 'v.仍然；保持' },
    { headwordId: 'heavy', gloss: 'a.繁忙的；拥挤的' },
    { headwordId: 'official', surface: 'Officials', gloss: 'n.官员；官方人士' },
    { headwordId: 'review', gloss: 'v.审查；复核' },
    { headwordId: 'assess', gloss: 'v.评估；估算' },
    { headwordId: 'extend', gloss: 'v.延伸；扩大' },
    { headwordId: 'empty', gloss: 'a.空的；空荡的' },
    { headwordId: 'rely', surface: 'reliable', gloss: 'a.可靠的；可信赖的' },
    { headwordId: 'special', gloss: 'a.特殊的；特别的' },
    { headwordId: 'favor', gloss: 'n.照顾；恩惠' },
    { headwordId: 'help', gloss: 'v.帮助；协助' },
    { headwordId: 'succeed', gloss: 'v.成功；奏效' },
    { headwordId: 'adjust', gloss: 'v.调整；调节' },
    { headwordId: 'promise', surface: 'promising', gloss: 'v.承诺；保证' },
    { headwordId: 'sustain', gloss: 'v.维持；持续' },
  ],
  phraseAnnotations: [],
  expansionEntries: [
    { id: 'no23-exp-01', expression: 'night shift', explanation: '夜班；夜间轮班' },
    { id: 'no23-exp-02', expression: 'late service', explanation: '深夜班次；延时服务' },
    { id: 'no23-exp-03', expression: 'commuter rail', explanation: '通勤铁路；城际铁路' },
    { id: 'no23-exp-04', expression: 'bus route', explanation: '公交线路；公共汽车路线' },
    { id: 'no23-exp-05', expression: 'transfer point', explanation: '换乘点；中转站' },
    { id: 'no23-exp-06', expression: 'service frequency', explanation: '发车频率；服务频次' },
    { id: 'no23-exp-07', expression: 'operating cost', explanation: '运营成本；运行费用' },
    { id: 'no23-exp-08', expression: 'passenger count', explanation: '客流量；乘客人数' },
    { id: 'no23-exp-09', expression: 'shift schedule', explanation: '轮班安排；排班表' },
    { id: 'no23-exp-10', expression: 'on a trial basis', explanation: '以试行方式；试行期间' },
    { id: 'no23-exp-11', expression: 'last train', explanation: '末班车；最后一班列车' },
    { id: 'no23-exp-12', expression: 'reliable connection', explanation: '稳定衔接；可靠的交通接驳' },
  ],
};
