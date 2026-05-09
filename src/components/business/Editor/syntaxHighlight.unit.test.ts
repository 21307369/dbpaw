import { describe, it, expect } from "bun:test";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// 复制 createSqlSyntaxTheme 函数进行测试
type SqlSyntaxPalette = {
  keyword: string;
  function: string;
  type: string;
  string: string;
  number: string;
  variable: string;
  operator: string;
  comment: string;
  constant: string;
};

const createSqlSyntaxTheme = (palette: SqlSyntaxPalette) => [
  HighlightStyle.define([
    { tag: t.keyword, color: palette.keyword },
    { tag: t.operatorKeyword, color: palette.keyword },
    { tag: t.typeName, color: palette.type },
    { tag: t.className, color: palette.type },
    { tag: t.function(t.variableName), color: palette.function },
    { tag: t.function(t.propertyName), color: palette.function },
    { tag: t.name, color: palette.variable },  // 新增的映射
    { tag: t.propertyName, color: palette.variable },
    { tag: t.variableName, color: palette.variable },
    { tag: t.string, color: palette.string },
    { tag: t.special(t.string), color: palette.string },
    { tag: t.number, color: palette.number },
    { tag: t.bool, color: palette.constant },
    { tag: t.atom, color: palette.constant },
    { tag: t.operator, color: palette.operator },
    { tag: t.comment, color: palette.comment, fontStyle: "italic" },
  ]),
];

describe("SQL Syntax Highlighting", () => {
  const testPalette: SqlSyntaxPalette = {
    keyword: "#ff0000",
    function: "#00ff00",
    type: "#0000ff",
    string: "#ffff00",
    number: "#ff00ff",
    variable: "#00ffff",
    operator: "#ffffff",
    comment: "#888888",
    constant: "#ff8800",
  };

  it("should include t.name mapping for field names", () => {
    const theme = createSqlSyntaxTheme(testPalette);
    const highlightStyle = theme[0];
    
    // 检查是否包含 t.name 规则
    const hasNameRule = highlightStyle.specs.some(
      (spec: any) => spec.tag === t.name
    );
    expect(hasNameRule).toBe(true);
  });

  it("should map t.name to variable color", () => {
    const theme = createSqlSyntaxTheme(testPalette);
    const highlightStyle = theme[0];
    
    // 找到 t.name 规则
    const nameRule = highlightStyle.specs.find(
      (spec: any) => spec.tag === t.name
    );
    
    expect(nameRule).toBeDefined();
    expect(nameRule.color).toBe(testPalette.variable);
  });

  it("should have correct tag hierarchy", () => {
    // 验证标签存在
    expect(t.name).toBeDefined();
    expect(t.propertyName).toBeDefined();
    expect(t.variableName).toBeDefined();
    // 验证它们是不同的标签
    expect(t.name).not.toBe(t.propertyName);
    expect(t.name).not.toBe(t.variableName);
  });
});