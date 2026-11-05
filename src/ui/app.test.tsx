import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toBlob } from 'html-to-image';
import { zipSync } from 'fflate';
import { App } from '../App';
import { GlobalPassageSearch } from '../components/PassageDiscovery';
import { compilePassage, DEMO_PASSAGES } from '../corpus';
import { COMPILED_CET4_BATCH_1_PASSAGES } from '../corpus/compiled-batch-1';
import type { CompiledPassage } from '../corpus';
import type { PassageSearchResult } from '../passage-library';
import { getDefaultSyllabusCatalog } from '../syllabus';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}));

vi.mock('fflate', () => ({
  zipSync: vi.fn(() => new Uint8Array([80, 75, 3, 4])),
}));

const COMPILED_DEMO_PASSAGES = DEMO_PASSAGES.map((passage) =>
  compilePassage(passage, getDefaultSyllabusCatalog())
);

function renderWithDemoPassages() {
  return render(<App passages={COMPILED_DEMO_PASSAGES} />);
}

function getAnnotationKeys(
  sentences: CompiledPassage['paragraphs'][number]['sentences']
): Set<string> {
  return new Set(
    sentences.flatMap((sentence) =>
      sentence.tokens.flatMap((token) =>
        token.type === 'annotation' ? [token.itemKey] : []
      )
    )
  );
}

function getMasteredKeys(container: HTMLElement): Set<string> {
  const itemKeys = new Set<string>();
  for (const annotation of container.querySelectorAll<HTMLElement>(
    '.inline-annotation'
  )) {
    const button = annotation.querySelector<HTMLButtonElement>(
      '.inline-annotation__surface'
    );
    const itemKey = annotation.dataset.itemKey;
    if (itemKey && button?.getAttribute('aria-pressed') === 'true') {
      itemKeys.add(itemKey);
    }
  }
  return itemKeys;
}

describe('双栏短文精读界面 (Seam 3: ui)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(toBlob).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('全局查词可按中文行间释义检索并打开结果短文', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.type(
      screen.getByRole('searchbox', { name: '全局查词' }),
      '自主权'
    );

    const result = await screen.findByRole('button', {
      name: /autonomous.*自主权.*守护认知自主/,
    });
    await user.click(result);

    expect(
      screen.getByRole('heading', {
        name: /在算法洪流中守护认知自主与深度阅读/,
      })
    ).toBeInTheDocument();
  });

  it('全局查词结果可继续展开到第 12 条之后', async () => {
    const user = userEvent.setup();
    const results: PassageSearchResult[] = Array.from(
      { length: 13 },
      (_, index) => ({
        key: `result-${index + 1}`,
        passageId: `passage-${index + 1}`,
        indexLabel: `NO. ${String(index + 1).padStart(2, '0')}`,
        tier: 'cet4-core',
        topic: '测试题材',
        titleZh: `测试短文 ${index + 1}`,
        titleEn: `Passage ${index + 1}`,
        kind: 'annotation',
        expression: `word-${index + 1}`,
        summary: 'n.词条；单词',
      })
    );
    render(
      <GlobalPassageSearch
        query="word"
        results={results}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /word-13/ })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /显示更多结果/ }));
    expect(screen.getByRole('button', { name: /word-13/ })).toBeInTheDocument();
  });

  it('短文目录展示待背进度与已读状态，并可按难度筛选后打开短文', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.click(screen.getByRole('button', { name: 'transformed' }));
    await user.click(screen.getByRole('button', { name: '短文目录' }));
    expect(
      screen.getByRole('heading', { name: '短文目录' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /NO\. 01.*待背词条 77 \/ 78.*已读/,
      })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /标记已读.*NO\. 02/ })
    );
    expect(
      screen.getByRole('button', { name: /NO\. 02.*已读 · 1 次/ })
    ).toBeInTheDocument();

    const topicFilter = screen.getByRole('combobox', { name: '按题材筛选' });
    await user.selectOptions(topicFilter, 'category:科技人工智能');
    expect(
      screen.queryByRole('button', { name: /NO\. 01.*重塑校园消费/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /NO\. 02.*在算法洪流/ })
    ).toBeInTheDocument();
    await user.selectOptions(topicFilter, 'all');

    await user.click(screen.getByRole('button', { name: '六级进阶篇' }));
    expect(
      screen.queryByRole('button', { name: /NO\. 01.*重塑校园消费/ })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /NO\. 02.*在算法洪流/ })
    );
    expect(
      screen.getByRole('heading', {
        name: /在算法洪流中守护认知自主与深度阅读/,
      })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '短文目录' }));
    expect(
      screen.getByRole('button', { name: /NO\. 02.*已读 · 2 次/ })
    ).toBeInTheDocument();
  });

  it('首次打开目录时按需加载完整语料，并复用加载结果进行翻页', async () => {
    const user = userEvent.setup();
    const fullCorpus = COMPILED_CET4_BATCH_1_PASSAGES;
    const loadAllPassages = vi.fn(async () => fullCorpus);
    render(
      <App
        passages={[fullCorpus[0]]}
        loadAllPassages={loadAllPassages}
      />
    );

    expect(
      screen.getByRole('heading', { name: fullCorpus[0].titleZh })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '短文目录' }));
    expect(
      await screen.findByRole('button', { name: /^NO\. 20/ })
    ).toBeInTheDocument();
    expect(loadAllPassages).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '返回精读' }));
    await user.click(screen.getByRole('button', { name: '下一篇短文' }));
    expect(
      await screen.findByRole('heading', { name: fullCorpus[1].titleZh })
    ).toBeInTheDocument();
    expect(loadAllPassages).toHaveBeenCalledTimes(1);
  });

  it('默认展示首篇四级核心篇短文：含三类基础图例（不含超纲词）、双语标题横幅、右上角篇目信息、分段双语正文行间标注与右侧拓展汇总', () => {
    renderWithDemoPassages();

    const legend = screen.getByRole('region', { name: '标注图例' });
    expect(within(legend).getByText('单词')).toBeInTheDocument();
    expect(within(legend).getByText('短语')).toBeInTheDocument();
    expect(within(legend).getByText('高频词')).toBeInTheDocument();
    expect(within(legend).queryByText('超纲词')).not.toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: /重塑校园消费习惯，共建可持续未来/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Reshaping Campus Consumption Habits for a Sustainable Future'
      )
    ).toBeInTheDocument();

    const metaBadge = screen.getByRole('region', { name: '篇目信息' });
    expect(within(metaBadge).getByText('NO. 01')).toBeInTheDocument();
    expect(within(metaBadge).getByText('四级核心篇')).toBeInTheDocument();
    expect(within(metaBadge).getByText('绿色校园与消费转型')).toBeInTheDocument();
    expect(screen.queryByText(/小红书/)).not.toBeInTheDocument();

    expect(screen.getAllByText('（第1段）').length).toBe(2);
    expect(screen.getAllByText('（第2段）').length).toBe(2);
    expect(screen.getAllByText('（第3段）').length).toBe(2);

    expect(screen.getByText('transformed')).toBeInTheDocument();
    expect(screen.getByText('v.改变；使改观；转化')).toBeInTheDocument();
    expect(screen.getByText('play a vital role in')).toBeInTheDocument();
    expect(screen.getByText('在…中发挥重要作用')).toBeInTheDocument();
    expect(
      screen.getByText(
        /在现代大学生活中，快捷的配送服务与便利的网络购物已经改变了日常消费模式。/
      )
    ).toBeInTheDocument();

    const expansionAside = screen.getByRole('complementary', {
      name: '熟词僻义及拓展汇总',
    });
    expect(
      within(expansionAside).getByText('熟词僻义及拓展汇总：')
    ).toBeInTheDocument();
    expect(
      within(expansionAside).getByText('consume/exhaust/deplete')
    ).toBeInTheDocument();
    expect(within(expansionAside).getByText(/消耗，耗尽/)).toBeInTheDocument();
    expect(
      within(expansionAside).getByText('in the long run/ultimately')
    ).toBeInTheDocument();
    expect(
      within(expansionAside).getByText(/从长远来看，归根结底/)
    ).toBeInTheDocument();
  });

  it('支持切换至六级进阶篇示例短文：按需动态显示超纲词图例与标注，切回四级核心篇时自动隐藏，且不包含译文遮挡或语音播放按钮', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.click(screen.getByRole('button', { name: '下一篇短文' }));

    expect(
      screen.getByRole('heading', {
        name: /在算法洪流中守护认知自主与深度阅读/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Safeguarding Cognitive Autonomy and Deep Reading in the Algorithmic Era'
      )
    ).toBeInTheDocument();

    const metaBadge = screen.getByRole('region', { name: '篇目信息' });
    expect(within(metaBadge).getByText('NO. 02')).toBeInTheDocument();
    expect(within(metaBadge).getByText('六级进阶篇')).toBeInTheDocument();
    expect(within(metaBadge).getByText('算法生态与认知自主')).toBeInTheDocument();

    const legend = screen.getByRole('region', { name: '标注图例' });
    expect(within(legend).getByText('超纲词')).toBeInTheDocument();

    expect(screen.getByText('algorithmic')).toBeInTheDocument();
    expect(screen.getByText('a.算法的；演算法驱动的')).toBeInTheDocument();
    expect(screen.getByText('neuroplasticity')).toBeInTheDocument();
    expect(screen.getByText('n.神经可塑性；脑回路重塑能力')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上一篇短文' }));
    expect(
      within(screen.getByRole('region', { name: '标注图例' })).queryByText(
        '超纲词'
      )
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: /遮挡|隐藏译文|隐藏释义/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /朗读|发音|播放/ })
    ).not.toBeInTheDocument();
  });

  it('点击行间标注后移除释义并保留虚线框状态', async () => {
    const user = userEvent.setup();
    const view = renderWithDemoPassages();
    const transformedButton = screen.getByRole('button', { name: 'transformed' });

    expect(transformedButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('v.改变；使改观；转化')).toBeInTheDocument();

    await user.click(transformedButton);

    expect(screen.getByRole('button', { name: 'transformed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('v.改变；使改观；转化')).not.toBeInTheDocument();

    view.unmount();
    renderWithDemoPassages();

    expect(screen.getByRole('button', { name: 'transformed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('v.改变；使改观；转化')).not.toBeInTheDocument();
  });

  it('按句批量标熟时按唯一词条计数，撤销只恢复本次新增项', async () => {
    const basePassage = COMPILED_DEMO_PASSAGES[0];
    const sourceSentence = basePassage.paragraphs[0].sentences[0];
    const repeatedToken = sourceSentence.tokens.find(
      (token) => token.type === 'annotation'
    );
    if (!repeatedToken) throw new Error('Expected an annotation in the fixture.');

    const repeatedSentence = {
      ...sourceSentence,
      tokens: [...sourceSentence.tokens, repeatedToken],
    };
    const passage: CompiledPassage = {
      ...basePassage,
      id: 'bulk-sentence-test',
      paragraphs: [
        {
          ...basePassage.paragraphs[0],
          sentences: [repeatedSentence],
        },
      ],
      expansionEntries: [],
    };
    const sentenceKeys = getAnnotationKeys([repeatedSentence]);
    const annotationCount = repeatedSentence.tokens.filter(
      (token) => token.type === 'annotation'
    ).length;
    expect(annotationCount).toBeGreaterThan(sentenceKeys.size);

    const user = userEvent.setup();
    const view = render(<App passages={[passage]} />);
    const previouslyMasteredKey = repeatedToken.itemKey;
    const previouslyMasteredButton = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>(
        '.inline-annotation__surface'
      )
    ).find(
      (button) =>
        button.parentElement?.getAttribute('data-item-key') ===
        previouslyMasteredKey
    );
    if (!previouslyMasteredButton) {
      throw new Error('Expected the existing annotation button.');
    }
    await user.click(previouslyMasteredButton);

    await user.click(
      screen.getByRole('button', { name: '标熟第1段第1句' })
    );

    const newlyMasteredCount = sentenceKeys.size - 1;
    expect(getMasteredKeys(view.container)).toEqual(sentenceKeys);
    expect(screen.getByRole('status')).toHaveTextContent(
      `已标熟 ${newlyMasteredCount} 个词条。`
    );
    expect(
      screen.getByRole('button', { name: '撤销本次批量标熟' })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: '撤销本次批量标熟' })
    );

    expect(getMasteredKeys(view.container)).toEqual(
      new Set([previouslyMasteredKey])
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '已撤销本次批量标熟。'
    );
  });

  it('按段批量标熟只覆盖该段中的唯一词条', async () => {
    const passage = COMPILED_DEMO_PASSAGES[0];
    const paragraphKeys = getAnnotationKeys(passage.paragraphs[0].sentences);
    const user = userEvent.setup();
    const view = render(<App passages={[passage]} />);

    await user.click(screen.getByRole('button', { name: '标熟第1段' }));

    expect(getMasteredKeys(view.container)).toEqual(paragraphKeys);
    expect(screen.getByRole('status')).toHaveTextContent(
      `已标熟 ${paragraphKeys.size} 个词条。`
    );
  });

  it('整篇批量标熟覆盖单词、短语和超纲词，并按新增词条数反馈', async () => {
    const passage = COMPILED_DEMO_PASSAGES[1];
    const sentences = passage.paragraphs.flatMap(
      (paragraph) => paragraph.sentences
    );
    const itemKeys = getAnnotationKeys(sentences);
    const categories = new Set(
      sentences.flatMap((sentence) =>
        sentence.tokens.flatMap((token) =>
          token.type === 'annotation' ? [token.category] : []
        )
      )
    );
    expect(categories).toContain('phrase');
    expect(categories).toContain('out-of-syllabus');

    const user = userEvent.setup();
    const view = render(<App passages={[passage]} />);
    await user.click(screen.getByRole('button', { name: '标熟整篇短文' }));

    expect(getMasteredKeys(view.container)).toEqual(itemKeys);
    expect(screen.getByRole('status')).toHaveTextContent(
      `已标熟 ${itemKeys.size} 个词条。`
    );
  });

  it('逐词掌握状态改变后立即关闭批量撤销入口', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.click(screen.getByRole('button', { name: '标熟整篇短文' }));
    expect(
      screen.getByRole('button', { name: '撤销本次批量标熟' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'transformed' }));

    expect(
      screen.queryByRole('button', { name: '撤销本次批量标熟' })
    ).not.toBeInTheDocument();
  });

  it('批量撤销入口在十秒后过期', () => {
    vi.useFakeTimers();
    renderWithDemoPassages();

    fireEvent.click(screen.getByRole('button', { name: '标熟整篇短文' }));
    expect(
      screen.getByRole('button', { name: '撤销本次批量标熟' })
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(
      screen.queryByRole('button', { name: '撤销本次批量标熟' })
    ).not.toBeInTheDocument();
  });

  it('隐藏拓展条目后连续重排编号并在重新进入短文后保持隐藏', async () => {
    const user = userEvent.setup();
    const view = renderWithDemoPassages();
    const aside = screen.getByRole('complementary', {
      name: '熟词僻义及拓展汇总',
    });

    await user.click(
      within(aside).getByRole('button', { name: /consume\/exhaust\/deplete/ })
    );

    expect(
      within(aside).queryByText('consume/exhaust/deplete')
    ).not.toBeInTheDocument();
    const nextEntry = within(aside).getByRole('button', {
      name: /in the long run\/ultimately/,
    });
    expect(
      within(nextEntry).getByText('⑬', { selector: '.passage-expansion__num' })
    ).toBeInTheDocument();

    view.unmount();
    renderWithDemoPassages();

    expect(screen.queryByText('consume/exhaust/deplete')).not.toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: '熟词僻义及拓展汇总' })
    ).toBeInTheDocument();
  });

  it('已掌握词库支持关键词检索和批量恢复标注', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.click(screen.getByRole('button', { name: 'transformed' }));
    await user.click(screen.getByRole('button', { name: 'rapid' }));
    await user.click(screen.getByRole('button', { name: '已掌握词库' }));

    const search = screen.getByRole('searchbox', { name: '搜索已掌握词条' });
    await user.type(search, 'transform');
    expect(screen.getByRole('checkbox', { name: '选择 transform' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '选择 rapid' })).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('checkbox', { name: '选择全部筛选结果' }));
    await user.click(screen.getByRole('button', { name: '恢复所选（2）' }));

    expect(screen.getByRole('button', { name: 'transformed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'rapid' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText('v.改变；使改观；转化')).toBeInTheDocument();
    expect(screen.getByText('a.迅速的；快捷的')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '已掌握词库' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已掌握词库' })).toHaveFocus();
  });

  it('同一大纲词目的不同短文词形同步掌握和恢复', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();

    await user.click(screen.getByRole('button', { name: 'individual' }));
    await user.click(screen.getByRole('button', { name: '下一篇短文' }));

    const secondPassageForm = screen.getByRole('button', { name: 'individuals' });
    expect(secondPassageForm).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('n.个人；个体')).not.toBeInTheDocument();

    await user.click(secondPassageForm);
    expect(screen.getByText('n.个人；个体')).toBeInTheDocument();
  });

  it('同形异义大纲词目保持独立掌握状态', async () => {
    const basePassage = COMPILED_DEMO_PASSAGES[0];
    const sentence = {
      ...basePassage.paragraphs[0].sentences[0],
      tokens: [
        {
          type: 'annotation' as const,
          category: 'regular' as const,
          itemKey: 'word:leadⅠ',
          surface: 'lead',
          gloss: 'n.铅；铅块',
          headwordId: 'leadⅠ',
        },
        { type: 'text' as const, text: ' / ' },
        {
          type: 'annotation' as const,
          category: 'regular' as const,
          itemKey: 'word:leadⅡ',
          surface: 'lead',
          gloss: 'v.带领；引导',
          headwordId: 'leadⅡ',
        },
      ],
    };
    const passage = {
      ...basePassage,
      id: 'homograph-check',
      paragraphs: [
        {
          ...basePassage.paragraphs[0],
          sentences: [sentence],
        },
      ],
      expansionEntries: [],
    };
    const user = userEvent.setup();
    render(<App passages={[passage]} />);

    const [leadOne] = screen.getAllByRole('button', { name: 'lead' });
    await user.click(leadOne);

    expect(screen.getAllByRole('button', { name: 'lead' })[0]).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getAllByRole('button', { name: 'lead' })[1]).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('全部超纲词掌握后隐藏图例，恢复一个后重新显示', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();
    await user.click(screen.getByRole('button', { name: '下一篇短文' }));

    const legend = screen.getByRole('region', { name: '标注图例' });
    expect(within(legend).getByText('超纲词')).toBeInTheDocument();
    for (const surface of [
      'algorithmic',
      'exacerbate',
      'neuroplasticity',
      'nuances',
    ]) {
      await user.click(screen.getByRole('button', { name: surface }));
    }
    expect(within(legend).queryByText('超纲词')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'algorithmic' }));
    expect(within(legend).getByText('超纲词')).toBeInTheDocument();
  });

  it('导入并导出本地学习状态，全部隐藏的拓展条目仍可恢复', async () => {
    const user = userEvent.setup();
    renderWithDemoPassages();
    await user.click(screen.getByRole('button', { name: '已掌握词库' }));

    const backup = {
      version: 1,
      masteredItemKeys: ['word:transform'],
      hiddenExpansionIds: {
        'demo-cet4-001': Array.from({ length: 14 }, (_, index) =>
          `cet4-exp-${index + 1}`
        ),
      },
      readingRecords: {
        'demo-cet4-001': {
          lastReadAt: '2026-11-03T00:00:00.000Z',
          visits: 7,
        },
      },
    };
    const backupFile = new File([JSON.stringify(backup)], 'backup.json', {
      type: 'application/json',
    });
    await user.upload(
      screen.getByLabelText('导入学习记录 JSON'),
      backupFile
    );

    expect(await screen.findByText('学习记录已导入。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'transformed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.queryByRole('complementary', { name: '熟词僻义及拓展汇总' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '已隐藏拓展条目（14）' })
    ).toBeInTheDocument();
    expect(screen.getByText(/7 次/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '已隐藏拓展条目（14）' }));
    await user.click(
      screen.getByRole('button', {
        name: '恢复拓展条目 consume/exhaust/deplete',
      })
    );
    expect(
      screen.getByRole('complementary', { name: '熟词僻义及拓展汇总' })
    ).toBeInTheDocument();

    let exportedBlob: Blob | undefined;
    const urlApi = {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:learning-state';
      }),
      revokeObjectURL: vi.fn(),
    };
    const downloadClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.stubGlobal('URL', urlApi);
    await user.click(screen.getByRole('button', { name: '导出 JSON' }));

    expect(screen.getByRole('status')).toHaveTextContent('JSON 备份已导出。');
    expect(urlApi.createObjectURL).toHaveBeenCalledTimes(1);
    expect(exportedBlob?.type).toBe('application/json');
    expect(downloadClick).toHaveBeenCalledTimes(1);
    const exportedJson = await new Promise<string>((resolve, reject) => {
      if (!exportedBlob) {
        reject(new Error('Export did not create a backup file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exportedBlob);
    });
    expect(JSON.parse(exportedJson)).toMatchObject({
      masteredItemKeys: ['word:transform'],
      hiddenExpansionIds: {
        'demo-cet4-001': Array.from(
          { length: 13 },
          (_, index) => `cet4-exp-${index + 2}`
        ),
      },
      readingRecords: {
        'demo-cet4-001': {
          lastReadAt: '2026-11-03T00:00:00.000Z',
          visits: 7,
        },
      },
    });
  });

  it('按固定宽度导出当前个性化短文为高清 PNG，并省略已隐藏拓展的恢复控件', async () => {
    const user = userEvent.setup();
    let resolvePng: (blob: Blob | null) => void = () => undefined;
    const pendingPng = new Promise<Blob | null>((resolve) => {
      resolvePng = resolve;
    });
    vi.mocked(toBlob).mockReturnValueOnce(pendingPng);

    const createObjectURL = vi.fn(() => 'blob:passage-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    let downloadedFilename = '';
    const downloadClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });

    renderWithDemoPassages();
    await user.click(screen.getByRole('button', { name: 'transformed' }));
    const expansionAside = screen.getByRole('complementary', {
      name: '熟词僻义及拓展汇总',
    });
    await user.click(
      within(expansionAside).getByRole('button', {
        name: /consume\/exhaust\/deplete/,
      })
    );

    await user.click(screen.getByRole('button', { name: '导出图片' }));

    expect(screen.getByRole('button', { name: '正在导出图片...' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('正在生成高清图片...');
    expect(toBlob).toHaveBeenCalledOnce();

    const [exportNode, options] = vi.mocked(toBlob).mock.calls[0];
    expect(options).toMatchObject({ width: 1080, pixelRatio: 2 });
    expect(exportNode).toHaveClass('passage-card--export');
    expect(
      exportNode.querySelector(
        '[data-item-key="word:transform"].inline-annotation--mastered'
      )
    ).not.toBeNull();
    expect(
      exportNode.querySelector(
        '[data-item-key="word:transform"] .inline-annotation__gloss'
      )
    ).toBeNull();
    expect(
      exportNode.querySelector(
        '.passage-expansion__item[data-expansion-id="cet4-exp-1"]'
      )
    ).toBeNull();
    expect(
      exportNode.querySelector(
        '.passage-expansion__item[data-expansion-id="cet4-exp-2"] .passage-expansion__num'
      )
    ).toHaveTextContent('①');
    expect(exportNode.querySelector('.passage-expansion__recovery')).toBeNull();

    resolvePng(new Blob(['png'], { type: 'image/png' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '高清 PNG 图片已开始下载。'
    );
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/png' })
    );
    expect(downloadClick).toHaveBeenCalledOnce();
    expect(downloadedFilename).toContain('NO. 01');
    expect(downloadedFilename).toContain('重塑校园消费习惯');
    expect(downloadedFilename).toMatch(/\.png$/);
  });

  it('按当前个性化状态将完整四级核心篇批量导出为ZIP中的20张高清PNG，且不切换当前短文', async () => {
    const user = userEvent.setup();
    vi.mocked(toBlob).mockResolvedValue(
      new Blob(['png'], { type: 'image/png' })
    );

    let downloadedBlob: Blob | undefined;
    let downloadedFilename = '';
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:passage-archive';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      }
    );

    const loadAllPassages = vi.fn(async () => COMPILED_CET4_BATCH_1_PASSAGES);
    render(
      <App
        passages={[COMPILED_CET4_BATCH_1_PASSAGES[0]]}
        loadAllPassages={loadAllPassages}
      />
    );

    await user.click(screen.getByRole('button', { name: '批量导出20篇' }));

    expect(
      await screen.findByText(
        '20 篇高清 PNG 图片已打包下载。',
        {},
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
    expect(loadAllPassages).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledTimes(20);
    expect(zipSync).toHaveBeenCalledOnce();
    const archiveFiles = vi.mocked(zipSync).mock.calls[0][0];
    expect(Object.keys(archiveFiles)).toHaveLength(20);
    expect(Object.keys(archiveFiles)[0]).toContain('NO. 01');
    expect(Object.keys(archiveFiles)[19]).toContain('NO. 20');
    expect(vi.mocked(zipSync).mock.calls[0][1]).toEqual({ level: 0 });
    expect(downloadedBlob?.type).toBe('application/zip');
    expect(downloadedFilename).toBe('cet4-core-passages.zip');
    expect(
      screen.getByRole('heading', {
        name: /跨越重洋的学术探索与文化适应/,
      })
    ).toBeInTheDocument();
  });

  it('导出时省略全部已隐藏拓展，并收起已无可见标注的图例与右栏', async () => {
    const user = userEvent.setup();
    vi.mocked(toBlob).mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' })
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:all-hidden'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined
    );

    renderWithDemoPassages();
    await user.click(screen.getByRole('button', { name: '下一篇短文' }));

    for (const surface of [
      'algorithmic',
      'exacerbate',
      'neuroplasticity',
      'nuances',
    ]) {
      await user.click(screen.getByRole('button', { name: surface }));
    }

    while (screen.queryByRole('complementary', { name: '熟词僻义及拓展汇总' })) {
      const aside = screen.getByRole('complementary', {
        name: '熟词僻义及拓展汇总',
      });
      await user.click(
        within(aside).getAllByRole('button', { name: /^隐藏拓展条目/ })[0]
      );
    }

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导出图片' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '高清 PNG 图片已开始下载。'
    );

    const [exportNode, options] = vi.mocked(toBlob).mock.calls[0];
    expect(options).toMatchObject({ width: 1080, pixelRatio: 2 });
    expect(exportNode.querySelector('.passage-card__body')).toHaveClass(
      'passage-card__body--full-width'
    );
    expect(exportNode.querySelector('.passage-expansion')).toBeNull();
    expect(exportNode.querySelector('.passage-expansion__recovery')).toBeNull();
    expect(within(exportNode).queryByText('超纲词')).not.toBeInTheDocument();
  });

  it('四级核心篇第 1 批短文库（共 20 篇）可通过界面目录完整浏览与切换精读', async () => {
    const user = userEvent.setup();
    render(<App passages={COMPILED_CET4_BATCH_1_PASSAGES} />);

    // Initial passage should be NO. 01 of batch 1
    expect(
      screen.getByRole('heading', { name: /跨越重洋的学术探索与文化适应/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Academic Exploration and Cultural Adaptation Abroad')
    ).toBeInTheDocument();

    // Open directory
    await user.click(screen.getByRole('button', { name: '短文目录' }));
    expect(
      screen.getByRole('heading', { name: '短文目录' })
    ).toBeInTheDocument();

    // Verify multiple batch 1 passages exist in directory
    expect(
      screen.getByRole('button', {
        name: /^NO\. 01.*跨越重洋的学术探索与文化适应/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /^NO\. 20.*现代数字健康管理、日常预防医疗与身心平衡/,
      })
    ).toBeInTheDocument();

    // Navigate to NO. 20
    await user.click(
      screen.getByRole('button', {
        name: /^NO\. 20.*现代数字健康管理、日常预防医疗与身心平衡/,
      })
    );
    expect(
      screen.getByRole('heading', { name: /现代数字健康管理、日常预防医疗与身心平衡/ })
    ).toBeInTheDocument();
  });
});
