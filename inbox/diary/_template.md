<%*
const choices = [
  ["notes · 笔记", "notes"],
  ["reading · 阅读", "reading"],
  ["making · 制作", "making"],
  ["research · 研究", "research"],
  ["talk · 杂谈", "talk"],
];
const category = (await tp.system.suggester(
  choices.map((c) => c[0]),
  choices.map((c) => c[1]),
  false,
  "选择类别 / pick a category",
)) || "notes";
const today = tp.date.now("YYYY-MM-DD");
-%>
---
title: "[<% category %>] <% today %>"
date: <% today %>
category: <% category %>
publish: false
description: ""
---

# <% today %>
