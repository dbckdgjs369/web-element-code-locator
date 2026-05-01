---
name: web-element-code-locator 프로젝트 목표
description: 이 라이브러리가 추구하는 핵심 설계 원칙
type: project
---

사용자가 `npm install react-code-locator`만 하면 되고, 추가 의존성이 설치되어서는 안 된다.

**Why:** 라이브러리의 핵심 가치 중 하나가 Zero dependencies (외부 설치 없이 동작). 사용자 경험을 최대한 단순하게 유지하려는 원칙.

**How to apply:** 모든 의존성은 번들에 통째로 묶거나(noExternal), 직접 구현으로 대체해야 한다. peer dependency나 optional dependency로 사용자에게 설치를 떠넘기는 방식은 허용하지 않는다. 모든 번들러(Vite, Webpack, Rollup, esbuild, Rspack)와 호환되어야 한다.
