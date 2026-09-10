"""M3（外审 medium，2026-09-10）：tools/build_course.py 把每周 HTML 塞进
`<script type="application/json">...</script>` 之前的转义改前是
`.replace('</','<\\/')`——区分大小写，`</SCRIPT>`、`</ScRiPt>` 这类大小写变体不会
被命中，同样能被浏览器 HTML 解析器当成 script 标签收尾提前截断，导致后面的 JSON
内容全部逃逸成页面正文。

改法：`embed_as_json_script_payload`（tools/build_course.py）把 JSON 文本里全部
字面量 `<` 转成 `<`（JSON 字符串合法的 Unicode 转义，JSON.parse 还原成同一个
字符），不区分大小写、不用逐一枚举 `</script>`/`</SCRIPT>`/`</ScRiPt>` 等写法。

本文件直接单测 embed_as_json_script_payload 这条转义逻辑本身（不需要跑通整条
render_course 的 node 子进程管线），并用真实构建产物 build/course.html 做一次
端到端确认（tests/browser/test_course.py 已经逐周点开 iframe，这里不重复浏览器
交互，只补"payload 结构层面确实没有可截断 script 的裸标签"这道静态检查）。
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import build_course  # noqa: E402


def node_json_parse_roundtrip(escaped_json_text):
    """用真实 Node 的 JSON.parse 还原一遍（不是只信任 Python 自己的 json.loads——
    转义目标就是给浏览器的 JSON.parse 消费，用同一个运行时核对最贴近真实场景）。"""
    result = subprocess.run(
        ['node', '-e', 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8"))))'],
        input=escaped_json_text, capture_output=True, text=True, encoding='utf-8'
    )
    assert result.returncode == 0, f'node JSON.parse 失败：{result.stderr}'
    return json.loads(result.stdout)


class BuildCoursePayloadEscapingTests(unittest.TestCase):
    def test_lowercase_close_script_tag_is_neutralized(self):
        data = {'weeks': [{'html': 'before</script>after'}]}
        escaped = build_course.embed_as_json_script_payload(data)
        self.assertNotIn('</', escaped, '转义后不应再出现任何 "</" 序列')
        html_page = f'<script type="application/json">{escaped}</script>'
        self.assertEqual(html_page.count('<script'), 1, '整页只应有这一个 <script> 标签开启')
        self.assertEqual(html_page.count('</script>'), 1, '整页只应有这一个 </script> 收尾（就是外层包裹的那个）')
        restored = node_json_parse_roundtrip(escaped)
        self.assertEqual(restored, data, 'node JSON.parse 还原后应与原始数据完全相等')

    def test_uppercase_close_script_tag_is_neutralized(self):
        data = {'weeks': [{'html': 'before</SCRIPT>after'}]}
        escaped = build_course.embed_as_json_script_payload(data)
        self.assertNotIn('<', escaped, '转义后不应再出现任何字面量 "<"（大小写变体一并处理）')
        restored = node_json_parse_roundtrip(escaped)
        self.assertEqual(restored, data, 'node JSON.parse 还原后应与原始数据完全相等（大写变体）')

    def test_mixed_case_close_script_tag_is_neutralized(self):
        data = {'weeks': [{'html': 'before</ScRiPt>after'}]}
        escaped = build_course.embed_as_json_script_payload(data)
        self.assertNotIn('<', escaped, '转义后不应再出现任何字面量 "<"（大小写混合变体一并处理）')
        restored = node_json_parse_roundtrip(escaped)
        self.assertEqual(restored, data, 'node JSON.parse 还原后应与原始数据完全相等（大小写混合变体）')

    def test_literal_backslash_escaped_form_is_still_handled(self):
        # 改前的写法本身产出的字面量（`<\/`）也应该能被新写法正确处理、不重复转义
        # 出双重反斜杠这类损坏 JSON 的结果。
        data = {'weeks': [{'html': 'before<\\/ after', 'note': 'contains a literal backslash-slash'}]}
        escaped = build_course.embed_as_json_script_payload(data)
        self.assertNotIn('<', escaped, '转义后不应再出现任何字面量 "<"（含改前写法产出的 "<\\/" 形态）')
        restored = node_json_parse_roundtrip(escaped)
        self.assertEqual(restored, data, 'node JSON.parse 还原后应与原始数据完全相等（含反斜杠字面量）')

    def test_real_built_course_html_payload_has_no_close_tag_sequences(self):
        # 端到端确认：真实构建产物 build/course.html 的 payload script 标签内容
        # 完全没有任何 "<" 字符，且 JSON.parse 能正常还原出完整的三周数据。
        course_path = ROOT / 'build' / 'course.html'
        self.assertTrue(course_path.exists(), f'{course_path} 不存在，请先跑 python tools/project.py build')
        html = course_path.read_text(encoding='utf-8')
        import re
        m = re.search(r'<script id="course-payload" type="application/json">([\s\S]*?)</script>', html)
        self.assertIsNotNone(m, '应能找到 id="course-payload" 的 script 标签')
        payload_text = m.group(1)
        self.assertNotIn('<', payload_text, '真实构建产物的 payload 文本里不应出现任何字面量 "<"')
        parsed = json.loads(payload_text)
        self.assertGreater(len(parsed.get('weeks', [])), 0, 'payload 应含至少一周数据')
        for week in parsed['weeks']:
            self.assertIn('<script', week['html'], '每周 html 字段还原后应包含真实的 <script 标签（证明反转义没有丢内容）')
            self.assertIn('</script>', week['html'], '每周 html 字段还原后应包含真实的 </script> 收尾')


if __name__ == '__main__':
    unittest.main()
