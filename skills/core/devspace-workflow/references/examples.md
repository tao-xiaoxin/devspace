# Examples

## Planning

User:

```text
@dev /plan 修复国家列表节点数量显示
```

Expected behavior:

- enter plan mode
- continue planning
- keep the immediate status brief

## Goal

User:

```text
@dev /goal 修复国家列表节点数量显示
```

Expected behavior:

- create or continue the goal
- report a short status

## Compact Answer

User:

```text
1B，2A
```

Expected behavior:

- treat the reply as answer payload
- complete pending user input if valid
- return a short status
