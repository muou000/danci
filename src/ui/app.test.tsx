import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('双栏短文精读界面 (Seam 3: ui)', () => {
  it('默认展示首篇四级核心篇短文：含三类基础图例（不含超纲词）、双语标题横幅、右上角篇目信息、分段双语正文行间标注与右侧拓展汇总', () => {
    render(<App />);

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
    render(<App />);

    const nav = screen.getByRole('navigation', { name: '示例短文切换' });
    await user.click(within(nav).getByRole('button', { name: /NO\. 02.*六级进阶篇/ }));

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

    await user.click(within(nav).getByRole('button', { name: /NO\. 01.*四级核心篇/ }));
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
});

