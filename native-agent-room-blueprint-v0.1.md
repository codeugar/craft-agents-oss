可以。下面是一版 **Native Agent Room Blueprint v0.1**，按我们已经确定的方向整理，目标是能直接指导后续开发、拆任务、做验收。

---

# Native Agent Room Blueprint v0.1

## 0. 一句话定义

**Native Agent Room 是 Craft Agents 的原生多 Agent 协作空间。**

它以 **Project** 作为上层对象，以 **Room** 承载具体页面 / 功能 / 任务协作，以 **RoomBus** 管理 Agent-to-Agent 受控通信，以 **Agent Inbox + Attention Model** 解决上下文分发，以 **Artifact / Task / Decision / RoomBus Event** 作为事实来源，以 **Room Timeline** 表达协作进度。

核心不是做一个热闹的 AI 群聊，而是做：

> **可复用、可观察、可追踪、可评审的多 Agent 项目协作系统。**

---

# 1. 我们的目标

## 1.1 产品目标

构建一个 Craft Agents 原生能力，使用户可以：

```text
创建 Project
↓
配置共享文档、设计规范、团队模板
↓
创建多个 Room
↓
在 Room 内配置多个 Agent 角色
↓
Agent 通过群聊式界面推进任务
↓
Agent 之间通过 RoomBus 受控协作
↓
系统通过 Inbox / @ / Task / Artifact / Decision 进行上下文分发
↓
最终产出可审阅的页面、代码、测试报告、设计规范等 artifacts
```

第一个核心场景是：

> **完整网站 / 页面开发流程。**

例如：

```text
Project: SaaS 官网
├── Project-level Artifacts
│   ├── design-tokens.json
│   ├── design-token-guide.md
│   ├── component-guidelines.md
│   ├── brand-voice.md
│   └── shared-rules.md
│
├── Team Templates
│   └── Page Development Team
│
└── Rooms
    ├── Home Page Room
    ├── Pricing Page Room
    ├── Features Page Room
    └── Contact Page Room
```

每个 Room 可以独立推进一个页面，但共享同一个 Project 的设计规范、组件规则、品牌语气和团队模板。

---

## 1.2 设计目标

这个系统要解决五个问题。

### 目标一：让 Agent 知道彼此存在

每个 Agent 不再是孤立 session，而是 Room 里的成员。

它知道：

```text
房间里有哪些 Agent
每个 Agent 负责什么
自己可以向谁提问
谁会消费自己的产物
谁可以 review 自己的产物
```

---

### 目标二：让 Agent 协作受控，而不是自由乱聊

Agent 不直接互相调用，而是通过 RoomBus：

```text
Agent A
↓
RoomBus
↓
Agent B
```

RoomBus 负责记录：

```text
谁向谁提了要求
请求类型是什么
关联哪个 task / artifact
状态是否 resolved
是否可能出现循环
```

MVP 阶段 RoomBus **不需要判断请求是否合理**，只需要做协议校验、记录和防死循环。

---

### 目标三：降低上下文压力

Agent 不读取完整群聊。

Agent 的上下文来自：

```text
Role Contract
+ Member Directory
+ Current Task
+ Required Artifacts
+ Direct Mentions
+ Assigned RoomBus Events
+ Owned Task / Artifact Updates
+ Dependency Updates
+ Relevant Decisions
+ Room Timeline
```

默认不包含：

```text
完整聊天记录
其他 Agent 的私有上下文
无关 Room 内容
无关历史消息
已废弃 artifact
被拒绝的 decision
无关 resolved events
```

---

### 目标四：让用户能看懂协作过程

用户看到的是群聊式推进，但底层是结构化事件。

例如：

```text
Frontend → Backend [ask_agent]
api-contract v1 缺少 yearlyPrice，请补充。

Backend → Frontend [answer_agent]
已更新 api-contract v2，新增 yearlyPrice。

QA → Frontend [review_result]
mobile pricing card overflow，severity: blocking。
```

用户还能看到每个 Agent 读取了哪些上下文：

```text
Frontend Agent read:
- pricing-ui-spec.md@v2
- design-tokens.json@v3
- api-contract-pricing.json@v2
- QA-004 mobile overflow issue
- @Frontend from UI Designer
```

---

### 目标五：让 Room 可复用、可复制、可 fork

用户可能要开发 6 到 8 个页面，因此 Room 配置必须可复用。

最终支持四类操作：

```text
1. Create Room from Team Template
2. Duplicate Room Config
3. Fork Room
4. Save Room as Team Template
```

其中：

```text
Team Template 复用角色、prompt、工具权限、默认 workflow。
Room Instance 保存具体页面的上下文、任务、产物和事件。
Fork Room 用于基于已有上下文探索另一个方案。
```

---

# 2. 上下文环境

这里的“上下文环境”分两层：

```text
产品上下文环境
Agent 上下文环境
```

---

## 2.1 产品上下文环境

系统最终由这些核心对象组成：

```text
Project
├── Project Artifacts
├── Team Templates
└── Rooms

Room
├── Members
├── Tasks
├── Artifacts
├── Decisions
├── RoomBus Events
├── Agent Inboxes
└── Room Timeline
```

---

## 2.2 Project

Project 是最高层对象。

不要叫 Website Project，也不要叫 Site Project，统一叫：

```text
Project
```

Project 保存跨 Room 共享的东西：

```text
全局 design token
组件规范
品牌语气
共享规则
团队模板
多个 Room
```

### Project 示例

```text
Project: Acme SaaS Website

Project-level Artifacts:
- design-tokens.json
- design-token-guide.md
- component-guidelines.md
- responsive-rules.md
- brand-voice.md
- shared-rules.md

Rooms:
- Home Page Room
- Pricing Page Room
- Features Page Room
- Contact Page Room
```

---

## 2.3 Room

Room 是具体协作空间。

一个 Room 可以对应：

```text
一个页面
一个功能
一个模块
一个视频脚本
一个设计探索
一个测试流程
```

MVP 先聚焦：

```text
一个 Room = 一个页面开发空间
```

例如：

```text
Room: Pricing Page Room
Goal: 开发 SaaS pricing page
Template: Page Development Team
Project: Acme SaaS Website
```

Room 内部包含：

```text
成员
群聊事件流
任务列表
产物列表
决策记录
Agent Inbox
Room Timeline
```

---

## 2.4 Team Template

Team Template 是角色配置的复用单元。

例如：

```text
Page Development Team
├── Facilitator Agent
├── PM Agent
├── UX Agent
├── Design Token Agent
├── UI Designer Agent
├── Frontend Agent
├── Backend API Agent
├── SEO/GEO Agent
├── QA Agent
└── Code Reviewer Agent
```

Team Template 保存：

```text
角色列表
每个角色 prompt
每个角色职责
每个角色可用动作
默认 workflow
RoomBus policy
默认 context policy
```

它不保存：

```text
某个页面的聊天历史
某个页面的 artifact
某个页面的 task
某个页面的 decision
```

---

## 2.5 Project-level Design Token 文档

Design Token 应该沉淀为 Project-level artifact。

建议至少两份：

```text
design-tokens.json
design-token-guide.md
```

`design-tokens.json` 给 Agent 和代码使用：

```json
{
  "color": {
    "background": "#FFFFFF",
    "surface": "#F7F8FA",
    "textPrimary": "#111827",
    "textSecondary": "#6B7280",
    "brandPrimary": "#2563EB"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "radius": {
    "sm": "6px",
    "md": "10px",
    "lg": "16px"
  }
}
```

`design-token-guide.md` 给 Agent 理解规则：

```text
所有页面必须使用 Project-level design tokens。
不得硬编码颜色、spacing、radius。
页面 Room 可以提出 token change request，但不能直接修改全局 token。
```

每个 Room 默认继承 Project-level artifacts，但不同 Agent 读取范围不同：

```text
UI Designer 读取 design token 和 component guidelines。
Frontend 读取 design token、UI spec、API contract。
QA 读取 design-token-guide 中的验收规则。
Backend 默认不读取 design token。
```

---

# 3. 上下文系统设计

## 3.1 核心原则

我们最终采用：

> **Attention-driven Context**

也就是：

```text
用 @ 和责任归属决定 Agent 的注意力。
用 Artifact 和 Task 决定 Agent 的事实来源。
用 Timeline 决定 Agent 的阶段感。
```

Agent 不读取完整群聊。  
Agent 读取自己的 Context Pack。

---

## 3.2 Agent Context 公式

每次 Agent 被调用时，它拿到的上下文是：

```text
Agent Context =
Role Contract
+ Member Directory
+ Current Task
+ Required Artifacts
+ Direct Mentions
+ Assigned RoomBus Events
+ Owned Task / Artifact Updates
+ Dependency Updates
+ Relevant Decisions
+ Room Timeline
```

默认排除：

```text
Full Transcript
Other Agents' Private Memory
Unrelated Messages
Unrelated Rooms
Deprecated Artifacts
Rejected Decisions
Resolved Events Not Linked to Current Task
```

---

## 3.3 @ 是核心上下文信号

Agent 主要关注：

```text
@我的消息
@我的角色的消息
@all 消息
@我负责的 task
@我负责的 artifact
```

例如：

```text
@Frontend 请确认 annual toggle 的状态处理。
```

一定进入 Frontend Agent Inbox。

```text
@QA 请基于 ui-spec v2 生成测试用例。
```

一定进入 QA Agent Inbox。

```text
@all 所有页面必须使用 design-tokens.json@v3。
```

进入所有 Agent Inbox，并生成 Project-level Decision 或 Artifact Update。

---

## 3.4 @ 不是唯一信号

除了显式 @，还要处理隐式责任关系。

例如：

```text
api-contract-pricing.json 更新到 v3。
```

即使没有 @Frontend，只要 Frontend 当前 task 依赖这个 artifact，也应该进入 Frontend Inbox。

最终规则：

```text
有 @ = 一定进入目标 Agent Inbox
无 @ + 有 task / artifact / decision / dependency 关联 = 进入相关 Agent Inbox
无 @ + 无关联 = 不进入 Agent Context
```

---

## 3.5 Agent Inbox

每个 Agent 都有自己的 Inbox。

进入 Inbox 的内容包括：

```text
1. @我的消息
2. @我的角色的消息
3. @all 消息
4. 发给我的 ask_agent
5. 发给我的 request_review
6. 指派给我的 blocker
7. 指派给我的 handoff
8. 针对我 artifact 的 review issue
9. 我订阅的 artifact 更新
10. 我的 task 状态变化
11. 我发出但尚未 resolved 的 request
```

区分三个对象：

```text
Room Transcript = 全部群聊记录，主要给用户看
Agent Inbox = 某个 Agent 需要关注的信息
Context Pack = Agent 实际执行任务时读取的上下文
```

---

## 3.6 Room Timeline

总结机制保留，但定位要明确。

它不作为事实来源，只作为时间线。

```text
Room Timeline:
1. 用户提出 Pricing Page 开发需求。
2. PM 和 UX 完成需求澄清。
3. Backend 提供 api-contract-pricing.json@v2。
4. UI Designer 提供 pricing-ui-spec.md@v2。
5. Frontend 进入实现阶段。
6. QA 提出 mobile overflow blocking issue。
```

Room Timeline 用来回答：

```text
现在走到哪一步？
大概发生了什么？
哪些阶段已经完成？
当前卡在哪里？
```

事实来源仍然是：

```text
Artifact
Task
Decision
RoomBus Event
```

不要让 Agent 只根据 Timeline 做具体判断。

---

## 3.7 Agent 缺少上下文时必须提问

Agent 不应该猜。

例如 Frontend Agent 缺少 API contract：

```text
Frontend Agent:
我缺少 api-contract-pricing.json，无法实现 API integration。
我将向 Backend API Agent 请求该 artifact。
```

生成 RoomBus event：

```text
Frontend → Backend [ask_agent]
请提供 pricing API contract，包括 endpoint、字段、monthly/yearly price、enterprise CTA、错误状态和 mock data。
```

这是系统的核心行为规则之一。

---

## 3.8 用户必须能看到 Agent 读取了哪些上下文

每次 Agent 回复旁边显示：

```text
Context Used
```

例如：

```text
Frontend Agent used:
- RoleCard: Frontend Engineer
- Task: Implement Pricing Page
- Artifacts:
  - pricing-ui-spec.md@v2
  - design-tokens.json@v3
  - api-contract-pricing.json@v2
- Attention Events:
  - @Frontend from UI Designer
  - QA review issue: mobile overflow
  - Backend answer: yearlyPrice added
- Timeline:
  - Current phase: Implementation
```

这能帮助用户判断 Agent 是否漏读了关键上下文。

---

# 4. Agent 容器设计

每个 Agent 不是单纯一个 prompt，而是一个 Agent Container。

## 4.1 Agent Container 包含

```text
RoleCard
Session
Inbox
Local Memory
Context Policy
Allowed RoomBus Actions
Tool Permissions
Owned Tasks
Owned Artifacts
Subscriptions
```

---

## 4.2 Agent Container 示例

```text
Frontend Agent Container
├── RoleCard: Frontend Engineer
├── Session: session_frontend_xxx
├── Inbox: frontend_inbox
├── Local Memory: frontend private working state
├── Context Policy:
│   ├── always include ui-spec
│   ├── always include design-tokens
│   ├── always include api-contract
│   └── include QA issues when task is bug_fix
├── Allowed RoomBus Actions:
│   ├── ask_agent
│   ├── raise_blocker
│   ├── request_review
│   ├── propose_change
│   └── mark_task_done
└── Subscriptions:
    ├── UI spec updates
    ├── design token updates
    ├── API contract updates
    └── QA issues assigned to frontend
```

---

# 5. RoomBus 设计

## 5.1 RoomBus 定义

RoomBus 是 Agent-to-Agent 的中间节点。

它负责：

```text
记录事件
转发请求
更新 Inbox
更新 Task 状态
更新 Timeline
防止循环
生成可观察日志
```

它不负责：

```text
判断请求内容是否合理
替 Agent 做业务决策
替用户做最终审批
```

---

## 5.2 RoomBus 基础动作

MVP 至少支持：

```text
ask_agent
answer_agent
raise_blocker
resolve_blocker
handoff_task
request_review
review_result
propose_change
artifact_update
decision
approval_request
announcement
```

---

## 5.3 RoomBus 事件示例

```json
{
  "id": "event_001",
  "roomId": "room_pricing_page",
  "from": "frontend_agent",
  "to": ["backend_api_agent"],
  "type": "ask_agent",
  "taskId": "task_frontend_pricing",
  "artifactId": "api_contract_pricing",
  "payload": {
    "message": "api-contract v1 缺少 yearlyPrice，annual toggle 无法实现。",
    "expectedOutput": "更新后的 API contract 或解释为什么不支持"
  },
  "status": "open",
  "createdAt": "2026-07-02T10:00:00Z"
}
```

---

## 5.4 RoomBus 最小规则

RoomBus 不做复杂语义判断，但必须做机械性约束：

```text
1. to 必须是存在的 Agent / Role / all / task / artifact
2. event 必须有 type
3. request 类事件必须有 expectedOutput
4. 最好绑定 taskId 或 artifactId
5. 每个 Agent 每轮最多发起 N 个请求
6. event 有 TTL / max hops
7. 不允许 A → B → A → B 无限循环
8. 危险操作必须进入 approval_request
```

---

# 6. 类型设计

下面是建议的 TypeScript 风格核心类型。

## 6.1 Project

```ts
type Project = {
  id: string
  name: string
  description?: string
  artifacts: ArtifactRef[]
  teamTemplates: TeamTemplateRef[]
  rooms: RoomRef[]
  createdAt: string
  updatedAt: string
}
```

---

## 6.2 Room

```ts
type Room = {
  id: string
  projectId: string
  templateId?: string
  name: string
  goal: string
  status: "draft" | "active" | "paused" | "completed" | "archived"
  phase:
    | "clarify"
    | "plan"
    | "foundation"
    | "design"
    | "implementation"
    | "review"
    | "fix"
    | "deliver"
  members: RoomMember[]
  tasks: Task[]
  artifacts: Artifact[]
  decisions: Decision[]
  events: RoomBusEvent[]
  timeline: TimelineItem[]
  createdAt: string
  updatedAt: string
}
```

---

## 6.3 TeamTemplate

```ts
type TeamTemplate = {
  id: string
  projectId?: string
  name: string
  description?: string
  roles: RoleCard[]
  defaultWorkflow: WorkflowTemplate
  roomBusPolicy: RoomBusPolicy
  createdAt: string
  updatedAt: string
}
```

---

## 6.4 RoleCard

```ts
type RoleCard = {
  id: string
  name: string
  roleKey: string
  mission: string
  prompt: string
  responsibilities: string[]
  inputs: string[]
  outputs: string[]
  allowedActions: RoomBusActionType[]
  forbiddenActions: string[]
  doneCriteria: string[]
  contextPolicy: ContextPolicy
}
```

---

## 6.5 RoomMember

```ts
type RoomMember = {
  id: string
  roomId: string
  roleCardId: string
  name: string
  roleKey: string
  sessionId: string
  inboxId: string
  status: "idle" | "working" | "blocked" | "waiting_review" | "done"
  ownedTaskIds: string[]
  ownedArtifactIds: string[]
}
```

---

## 6.6 AgentInbox

```ts
type AgentInbox = {
  id: string
  roomId: string
  agentId: string
  items: InboxItem[]
}
```

```ts
type InboxItem = {
  id: string
  eventId: string
  type:
    | "mention"
    | "request"
    | "review_request"
    | "blocker"
    | "handoff"
    | "artifact_update"
    | "task_update"
    | "decision_update"
    | "announcement"
  status: "unread" | "read" | "handled" | "dismissed"
  priority: "low" | "normal" | "high" | "blocking"
  createdAt: string
}
```

---

## 6.7 Task

```ts
type Task = {
  id: string
  roomId: string
  title: string
  description: string
  ownerAgentId: string
  phase: Room["phase"]
  status:
    | "todo"
    | "in_progress"
    | "blocked"
    | "waiting_review"
    | "changes_requested"
    | "done"
  inputArtifactIds: string[]
  outputArtifactIds: string[]
  dependencyTaskIds: string[]
  doneCriteria: string[]
  createdAt: string
  updatedAt: string
}
```

---

## 6.8 Artifact

```ts
type Artifact = {
  id: string
  projectId?: string
  roomId?: string
  taskId?: string
  name: string
  type:
    | "requirements"
    | "design_tokens"
    | "design_guide"
    | "component_guidelines"
    | "ui_spec"
    | "api_contract"
    | "mock_data"
    | "implementation"
    | "test_plan"
    | "qa_report"
    | "seo_geo"
    | "review_report"
    | "shared_rules"
    | "other"
  scope: "project" | "room" | "task"
  ownerAgentId?: string
  version: number
  status: "draft" | "approved" | "deprecated"
  tags: string[]
  sections?: ArtifactSection[]
  contentRef: string
  createdAt: string
  updatedAt: string
}
```

---

## 6.9 RoomBusEvent

```ts
type RoomBusEvent = {
  id: string
  projectId: string
  roomId: string
  from: AgentId | "user" | "system"
  to?: TargetRef[]
  type: RoomBusActionType
  taskId?: string
  artifactId?: string
  decisionId?: string
  payload: Record<string, unknown>
  status: "open" | "resolved" | "rejected" | "expired"
  createdAt: string
  resolvedAt?: string
}
```

```ts
type RoomBusActionType =
  | "message"
  | "ask_agent"
  | "answer_agent"
  | "raise_blocker"
  | "resolve_blocker"
  | "handoff_task"
  | "request_review"
  | "review_result"
  | "propose_change"
  | "artifact_update"
  | "decision"
  | "approval_request"
  | "announcement"
```

---

## 6.10 TargetRef

```ts
type TargetRef =
  | { type: "agent"; id: string }
  | { type: "role"; roleKey: string }
  | { type: "all" }
  | { type: "task"; id: string }
  | { type: "artifact"; id: string }
```

---

## 6.11 Decision

```ts
type Decision = {
  id: string
  projectId: string
  roomId?: string
  title: string
  description: string
  scope: "project" | "room" | "task"
  status: "proposed" | "approved" | "rejected" | "superseded"
  relatedTaskIds: string[]
  relatedArtifactIds: string[]
  createdBy: AgentId | "user" | "system"
  approvedBy?: "user" | AgentId
  createdAt: string
  updatedAt: string
}
```

---

## 6.12 ContextPolicy

```ts
type ContextPolicy = {
  alwaysInclude: ContextSourceType[]
  requiredArtifactTypes: Artifact["type"][]
  optionalArtifactTypes: Artifact["type"][]
  includeEvents: RoomBusActionType[]
  exclude: ContextExcludeRule[]
  subscriptions: SubscriptionRule[]
}
```

---

## 6.13 ContextPack

```ts
type ContextPack = {
  agentId: string
  roomId: string
  taskId?: string
  triggerEventId?: string
  roleContext: RoleCard
  memberDirectory: RoomMemberSummary[]
  currentTask?: Task
  requiredArtifacts: ArtifactRef[]
  relevantDecisions: Decision[]
  attentionEvents: RoomBusEvent[]
  inboxItems: InboxItem[]
  timeline: TimelineItem[]
  contextUsed: ContextUsedItem[]
}
```

---

## 6.14 TimelineItem

```ts
type TimelineItem = {
  id: string
  roomId: string
  title: string
  description: string
  phase: Room["phase"]
  sourceEventIds: string[]
  sourceArtifactIds: string[]
  sourceDecisionIds: string[]
  createdAt: string
}
```

---

# 7. Room 创建方式

最终确定四种方式。

## 7.1 Create Room from Team Template

从模板创建新 Room。

继承：

```text
角色配置
prompt
默认 workflow
RoomBus policy
context policy
工具权限
```

不继承：

```text
旧 Room 聊天
旧 Room task
旧 Room artifact
旧 Room decision
旧 Room inbox
```

适合：

```text
基于同一套页面开发团队开发新页面
```

---

## 7.2 Duplicate Room Config

复制已有 Room 的配置，但不复制工作历史。

复制：

```text
角色
prompt
workflow
context policy
RoomBus policy
```

不复制：

```text
聊天历史
任务状态
产物
决策
inbox
timeline
```

适合：

```text
A Room 调好了角色配置，希望 B Room 也沿用。
```

---

## 7.3 Fork Room

完整 fork 已有 Room。

复制：

```text
角色配置
聊天历史
任务
产物
决策
timeline
上下文状态
```

适合：

```text
基于同一个页面探索另一个方案
```

例如：

```text
Pricing Page Room
├── Fork A: Stripe 风格
└── Fork B: Linear 风格
```

---

## 7.4 Save Room as Team Template

把当前 Room 的团队配置保存为模板。

保存：

```text
角色配置
prompt
workflow
context policy
RoomBus policy
```

不保存：

```text
页面特定上下文
聊天历史
task
artifact
decision
timeline
```

适合：

```text
把调好的团队沉淀成可复用模板。
```

---

# 8. 默认页面开发流程

MVP 默认使用 Page Development Team。

## 8.1 默认角色

```text
Facilitator Agent
PM Agent
UX Agent
Design Token Agent
UI Designer Agent
Frontend Agent
Backend API Agent
SEO/GEO Agent
QA Agent
Code Reviewer Agent
```

---

## 8.2 默认阶段

```text
Phase 1: Clarify
- PM / UX / Backend / SEO-GEO 参与需求澄清

Phase 2: Plan
- Facilitator 生成任务计划
- 用户确认计划

Phase 3: Foundation
- Design Token Agent 确认设计规范
- Backend API Agent 生成 API contract
- SEO/GEO Agent 生成页面优化要求

Phase 4: Design
- UI Designer 生成 UI spec

Phase 5: Implementation
- Frontend Agent 实现页面
- Backend Agent 补充 mock / integration notes

Phase 6: Review
- QA Agent 测试
- UI Designer review 视觉
- Code Reviewer review 代码
- SEO/GEO Agent review 页面结构

Phase 7: Fix
- Frontend / Backend 根据 review 修复

Phase 8: Deliver
- Facilitator 汇总交付物
```

---

# 9. UI Blueprint

## 9.1 Project 页面

Project 页面展示：

```text
Project Name
Project-level Artifacts
Team Templates
Rooms
Recent Timeline
```

主要操作：

```text
New Room
New Team Template
Upload / Create Project Artifact
Open Room
Duplicate Room Config
Fork Room
Save Room as Template
```

---

## 9.2 Room 主界面

采用三栏结构。

```text
左侧：Room Members / Agent Inbox / Task Status
中间：Room Timeline + 群聊事件流
右侧：Artifacts / Context Used / Decisions / Blockers / Reviews
```

---

## 9.3 左侧：成员和 Inbox

显示：

```text
Frontend Agent
- Current task: Implement Pricing Page
- 2 mentions
- 1 blocker
- 1 review request

Backend Agent
- Current task: API Contract
- 1 request from Frontend

QA Agent
- Waiting for implementation
```

点击 Agent 可打开：

```text
Agent Inbox
RoleCard
Prompt
Context Policy
Owned Tasks
Owned Artifacts
```

---

## 9.4 中间：群聊事件流

消息以群聊形式展示，但保留事件类型。

例如：

```text
Frontend → Backend [ask_agent]
api-contract v1 缺少 yearlyPrice，请补充。

Backend → Frontend [answer_agent]
已更新 api-contract v2。

QA → Frontend [review_result]
mobile pricing card overflow，severity: blocking。
```

支持：

```text
@Agent
@Role
@all
@task
@artifact
```

---

## 9.5 右侧：Artifacts / Context Used

右侧展示：

```text
Artifacts
- requirements.md
- design-tokens.json
- ui-spec.md
- api-contract.json
- implementation-notes.md
- qa-report.md

Decisions
- D-001 approved
- D-002 pending

Blockers
- QA-004 mobile overflow

Context Used
- 当前选中 Agent 本轮读取了哪些内容
```

---

# 10. 开发顺序建议

## P0：数据模型和存储

先实现：

```text
Project
Room
TeamTemplate
RoleCard
RoomMember
Task
Artifact
Decision
RoomBusEvent
AgentInbox
TimelineItem
ContextPack
```

目标：

```text
Craft 原生知道 Room 和 Project 的存在。
```

---

## P1：Room 创建和角色配置

实现：

```text
Create Room from Template
Duplicate Room Config
Fork Room
Save Room as Team Template
Role Prompt Editor
```

目标：

```text
用户能创建 Room，并配置多个 Agent 角色。
```

---

## P2：RoomBus 和 Agent Inbox

实现：

```text
ask_agent
answer_agent
raise_blocker
request_review
review_result
handoff_task
artifact_update
announcement
```

并让事件进入对应 Agent Inbox。

目标：

```text
Agent 之间可以通过受控协议互相请求、提问、交接、评审。
```

---

## P3：Attention Model 和 Context Resolver

实现：

```text
@Agent
@Role
@all
@task
@artifact
task owner matching
artifact owner matching
dependency update matching
decision relevance matching
```

生成 Context Pack。

目标：

```text
Agent 不再读取完整群聊，而是读取自己的上下文包。
```

---

## P4：Artifact 和 Decision 系统

实现：

```text
Project-level Artifact
Room-level Artifact
Task-level Artifact
Artifact Version
Decision Log
Approved / Deprecated 状态
```

目标：

```text
Artifact 成为事实来源。
```

---

## P5：Room Timeline

实现：

```text
TimelineItem
自动从 RoomBusEvent / Task / Artifact / Decision 生成阶段时间线
```

目标：

```text
总结机制以 Timeline 形式存在，只描述推进过程，不作为事实来源。
```

---

## P6：UI 三栏视图

实现：

```text
Project View
Room View
Member List
Agent Inbox
Room Event Stream
Artifact Panel
Context Used Panel
Task / Blocker / Review Panel
```

目标：

```text
用户能看懂多 Agent 协作过程。
```

---

# 11. 验收标准

## 11.1 Project 验收标准

必须满足：

```text
用户可以创建 Project
用户可以在 Project 下创建多个 Room
用户可以在 Project 下管理共享 Artifacts
用户可以在 Project 下管理 Team Templates
Room 可以继承 Project-level Artifacts
```

测试用例：

```text
创建 Project: Acme SaaS Website
添加 design-tokens.json
添加 component-guidelines.md
创建 Pricing Page Room
确认 Pricing Page Room 能引用 Project-level design-tokens.json
```

---

## 11.2 Room 创建验收标准

必须支持：

```text
Create Room from Team Template
Duplicate Room Config
Fork Room
Save Room as Team Template
```

验收条件：

```text
从 Template 创建的新 Room 不包含旧 Room 聊天历史
Duplicate Room Config 不复制旧 artifacts
Fork Room 复制旧历史和 artifacts
Save as Team Template 只保存角色和 workflow 配置
```

---

## 11.3 Agent 成员目录验收标准

每个 Agent 运行时必须知道：

```text
自己是谁
房间里有哪些成员
每个成员负责什么
自己可以向哪些成员发起什么动作
```

测试用例：

```text
Frontend Agent 能识别 Backend API Agent 负责 API contract
Frontend Agent 能向 Backend API Agent 发起 ask_agent
QA Agent 能向 Frontend Agent 发起 review_result
```

---

## 11.4 Agent Inbox 验收标准

必须满足：

```text
@Agent 进入对应 Agent Inbox
@Role 进入对应角色 Agent Inbox
@all 进入所有 Agent Inbox
@task 进入 task owner Inbox
@artifact 进入 artifact owner / dependent task owner Inbox
RoomBus request 进入目标 Agent Inbox
Artifact dependency update 进入依赖该 artifact 的 Agent Inbox
```

测试用例：

```text
发送 @Frontend 消息
Frontend Inbox 出现该消息
Backend Inbox 不出现该消息

更新 api-contract-pricing.json
Frontend 当前 task 依赖该 artifact
Frontend Inbox 收到 artifact_update
```

---

## 11.5 Context Pack 验收标准

每次 Agent 执行任务时，系统必须生成 Context Pack。

Context Pack 必须包含：

```text
RoleCard
Member Directory
Current Task
Required Artifacts
Direct Mentions
Assigned RoomBus Events
Relevant Decisions
Room Timeline
```

必须排除：

```text
完整群聊记录
其他 Agent 私有记忆
无关 Room 内容
无关历史事件
已废弃 artifacts
被拒绝 decisions
```

测试用例：

```text
Frontend Agent 执行 Implement Pricing Page 任务
Context Pack 包含 ui-spec、design-tokens、api-contract
Context Pack 不包含 Backend 内部讨论全文
Context Pack 不包含其他 Room 的页面内容
```

---

## 11.6 Context Used 验收标准

每次 Agent 回复时，用户都能查看：

```text
Agent 本轮读取了哪些 artifacts
Agent 本轮读取了哪些 RoomBus events
Agent 本轮使用了哪个 task
Agent 本轮使用了哪些 decisions
Agent 本轮使用了哪些 timeline items
```

测试用例：

```text
Frontend 回复后，展开 Context Used
能看到 pricing-ui-spec.md@v2、design-tokens.json@v3、api-contract-pricing.json@v2
```

---

## 11.7 RoomBus 验收标准

RoomBus 必须记录：

```text
from
to
type
taskId
artifactId
payload
status
createdAt
resolvedAt
```

必须支持：

```text
ask_agent
answer_agent
raise_blocker
resolve_blocker
handoff_task
request_review
review_result
artifact_update
decision
announcement
```

必须具备：

```text
目标存在校验
事件类型校验
request expectedOutput 校验
TTL / max hops
防止无限循环
```

---

## 11.8 Timeline 验收标准

Timeline 必须：

```text
按照时间记录 Room 推进过程
引用 sourceEventIds / sourceArtifactIds / sourceDecisionIds
不作为 Agent 的事实来源
可以帮助用户理解当前阶段
```

测试用例：

```text
Backend 更新 API contract
Timeline 出现 API Contract Ready 事件
Timeline item 引用 artifact id 和 RoomBus event id
```

---

## 11.9 Agent 缺少上下文验收标准

Agent 缺少 required artifact 时，必须提问或 raise blocker，不得猜测。

测试用例：

```text
Frontend task 缺少 api-contract
Frontend 不直接实现 API integration
Frontend 通过 RoomBus ask_agent 给 Backend
Task 标记为 blocked 或 waiting_input
```

---

## 11.10 Artifact 事实来源验收标准

Agent 的关键判断必须基于 artifact / decision / task / RoomBus event，而不是纯 timeline summary。

测试用例：

```text
Timeline 说 UI spec 已完成
但 ui-spec.md artifact 不存在
Frontend 不应开始实现
Frontend 应该请求 UI Designer 提供 ui-spec artifact
```

---

# 12. MVP 范围

## 必做

```text
Project
Room
Team Template
Role Prompt Editor
RoomBus
Agent Inbox
Attention Model
Context Pack
Context Used
Artifact Panel
Room Timeline
Create Room from Template
Duplicate Room Config
Fork Room
Save Room as Template
```

## 可以后置

```text
复杂 DAG
完全自动并行执行
复杂权限系统
跨 Project 复用
智能判断请求是否合理
多 Agent 自由 debate
复杂 dashboard
自动 PR / 发布流程
```

---

# 13. 最终确定版原则

这几个原则建议直接写进开发文档顶部。

```text
1. Project 是最高层对象。
2. Room 是具体协作空间。
3. Team Template 用于复用角色和 workflow。
4. Agent 之间不自由互聊，而是通过 RoomBus 受控协作。
5. 每个 Agent 都有自己的 Inbox。
6. @ 是上下文分发的核心显式信号。
7. Task / Artifact / Decision / Dependency 是上下文分发的隐式信号。
8. Agent 不读取完整群聊，只读取 Context Pack。
9. Artifact / Task / Decision / RoomBus Event 是事实来源。
10. Timeline 只是流程总结，不是事实来源。
11. Agent 缺上下文时必须提问，不得猜。
12. 用户必须能看到 Agent 本轮读取了哪些上下文。
13. Room 可以创建、复制配置、fork，也可以保存为模板。
```

---

# 14. 开发蓝图结论

最终开发目标可以这样写：

> 在 Craft Agents 中新增原生 Project / Room / Team Template / RoomBus / Agent Inbox / Context Pack 能力。用户可以在 Project 下创建多个 Room，每个 Room 由多个可配置 Agent 组成。Agent 通过 RoomBus 以受控方式互相请求、提问、交接、评审和报告阻塞。系统基于 @、任务归属、产物归属、依赖更新和决策变化为每个 Agent 构建 Inbox，并在执行时生成 Context Pack。群聊界面展示协作过程，Timeline 展示流程进展，Artifact / Task / Decision / RoomBus Event 作为真实状态来源。用户可以复用 Team Template、复制 Room 配置、fork Room，并检查每个 Agent 本轮读取的上下文。
