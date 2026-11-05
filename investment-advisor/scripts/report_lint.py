#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
report_lint.py — 四步法报告的骨架闸（v3.4.16）

用途：报告开写后、交付前，机械检查「技能规定的骨架」是否齐。
背景：2026-11-01 郎刚质疑「为什么你的四步法每次格式都不一样，比如买入价格的划分」，
      查库发现 14 份报告 14 种结构，H10/H12/H15/H17.46 固定档位在平安那份完全缺失，
      双表制（表 A / 表 B）14 份里只有 1 份写。规则存在，但没有任何执行载体。

设计原则：检查「内容在不在」，不管「章节怎么编号」。
          编号风格允许 〇一二三 / 0.1.2. / §0 §1 三种，但必备要素一个不能少。

用法：
    python3 report_lint.py <报告.md> [更多报告...]
    python3 report_lint.py --glob '~/Documents/LG/郎刚的宝库/个人知识库/唐朝分析法/*/*四步法*.md'
    python3 report_lint.py --all          # 扫默认库

退出码：0 全过；1 有 FAIL。
"""
import sys
import re
import glob as globmod
import pathlib

# 每条规则：(代号, 说明, 判定函数)
# 判定函数签名 f(text) -> (bool, 证据字符串)


def _has_mult(text, *pats):
    """全部出现才算过"""
    miss = [p for p in pats if not re.search(p, text)]
    return (not miss), ('缺: ' + ', '.join(miss) if miss else '全在')


RULES = [
    ('R1  H10 回报门槛价', lambda t: _has_mult(t, r'H\s*10')),
    ('R2  H12 初始关注价', lambda t: _has_mult(t, r'H\s*12')),
    ('R3  H15 优秀机会价', lambda t: _has_mult(t, r'H\s*15')),
    ('R4  H17.46 目标机会价', lambda t: _has_mult(t, r'H\s*17[.\s]*4?6?')),
    ('R5  表A 机械档', lambda t: _has_mult(t, r'表\s*A')),
    ('R6  表B 实际档', lambda t: _has_mult(t, r'表\s*B')),
    ('R7  1,000万基数目标配置',
     lambda t: _has_mult(t, r'1[,，]?000\s*万')),
    ('R8  绝对金额（万）', lambda t: _has_mult(t, r'\d+\s*[–\-~至]\s*\d+\s*万|\d+\s*万')),
    ('R9  前置闸三输出',
     lambda t: _has_mult(t, r'precheck|前置闸')),
    ('R10 唐朝法交叉引用',
     lambda t: _has_mult(t, r'唐朝法|唐朝估值法')),
    ('R11 八维（核心六维）',
     lambda t: _has_mult(t, r'八维|核心六维')),
    ('R12 最强反方',
     lambda t: _has_mult(t, r'最强反方|反面')),
    ('R13 镜子测试',
     lambda t: _has_mult(t, r'镜子测试')),
]

# 档位价格的合理性抽查：H10 > H12 > H15 > H17.46，且现价必须有唯一值
NUM = r'([0-9]+(?:\.[0-9]+)?)'


def _pick_price(text, tag_pattern):
    """取某档对应的价格：优先在表格行内取第一个 >20 的数（跳过 10%/12% 这类回报率）。

    返回 (值 or None)。取不到返回 None，调用方按"解析失败"处理，不当 FAIL。
    """
    for m in re.finditer(tag_pattern, text):
        line_start = text.rfind('\n', 0, m.start()) + 1
        line_end = text.find('\n', m.end())
        line = text[line_start: line_end if line_end != -1 else len(text)]
        nums = [float(x) for x in re.findall(r'[0-9]+(?:\.[0-9]+)?', line[m.start() - line_start:])]
        for v in nums:
            if 20 < v < 5000:      # 价格区间，排除 10/12/15/17.46 这些回报率
                return v
    return None


def spell_check_tiers(text):
    """查四档是否单调递减（H10 > H12 > H15 > H17.46）。返回 (ok, msg)。

    ok=None 表示无法解析（WARN，不算 FAIL）；ok=False 才算真错。
    """
    got = {}
    for tag, key in (('H10', r'H\s*10'), ('H12', r'H\s*12'),
                     ('H15', r'H\s*15'), ('H1746', r'H\s*17[.\s]*46')):
        v = _pick_price(text, key)
        if v is not None:
            got[tag] = v
    if len(got) < 4:
        return None, f'只解析到 {len(got)}/4 档，跳过单调性检查（需人工核）'
    seq = [got['H10'], got['H12'], got['H15'], got['H1746']]
    if all(seq[i] > seq[i + 1] for i in range(3)):
        return True, 'H10>H12>H15>H17.46 单调 ✓ ' + '/'.join(f'{x:g}' for x in seq)
    return False, '四档非单调：' + '/'.join(f'{x:g}' for x in seq) + '（可能引错列，注意①列非股价）'


def lint_one(path):
    p = pathlib.Path(path).expanduser()
    if not p.exists():
        print(f'!! 文件不存在: {p}')
        return False
    text = p.read_text(encoding='utf-8')
    lines = text.splitlines()
    print('=' * 78)
    print(f'{p.name}   ({len(lines)} 行, {len(text)} 字符)')
    print('-' * 78)
    allok = True
    for name, fn in RULES:
        ok, ev = fn(text)
        print(f'  {"PASS" if ok else "FAIL"}  {name:<26} {ev}')
        allok = allok and ok
    ok, msg = spell_check_tiers(text)
    tag = 'PASS' if ok is True else ('WARN' if ok is None else 'FAIL')
    print(f'  {tag}  四档单调性                {msg}')
    if ok is False:
        allok = False
    return allok


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    targets = []
    if args[0] == '--all':
        base = pathlib.Path.home() / 'Documents/LG/郎刚的宝库/个人知识库/唐朝分析法'
        targets = sorted(str(x) for x in base.glob('*/*四步法*.md'))
    elif args[0] == '--glob':
        targets = sorted(globmod.glob(str(pathlib.Path(args[1]).expanduser())))
    else:
        targets = args

    if not targets:
        print('没有匹配到文件')
        return 2

    results = {}
    for t in targets:
        results[t] = lint_one(t)

    fail = [k for k, v in results.items() if not v]
    print()
    print('=' * 78)
    print(f'合计 {len(targets)} 份，PASS {len(targets) - len(fail)}，FAIL {len(fail)}')
    for f in fail:
        print(f'  ✗ {pathlib.Path(f).name}')
    return 0 if not fail else 1


if __name__ == '__main__':
    sys.exit(main())
