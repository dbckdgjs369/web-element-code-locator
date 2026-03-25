# Troubleshooting

## 클릭해도 아무 반응이 없어요

**1. 플러그인이 활성화되어 있는지 확인하세요.**

`enabled` 기본값은 `NODE_ENV === "development"`입니다. 개발 서버가 아닌 환경에서는 자동으로 비활성화됩니다.

**2. 트리거 키를 확인하세요.**

기본값은 `Shift + Click`입니다. `triggerKey` 옵션을 변경한 경우 해당 키를 누른 상태로 클릭해야 합니다.

**3. `disabled` 요소나 `pointer-events: none`이 적용된 요소는 감지되지 않습니다.**

해당 요소의 부모 요소를 클릭하세요.

---

## "No React component source metadata found" 에러가 나와요

빌드 플러그인이 소스 transform을 하지 못한 경우입니다.

- 플러그인 설정이 올바른지 확인하세요.
- `include` 패턴이 해당 파일을 포함하는지 확인하세요. (기본값: `/\.[jt]sx$/`)
- `.tsx` 파일에 `<T,>` 형태의 제네릭 화살표 함수가 있는 경우 해당 파일은 transform이 스킵됩니다. `function` 선언형으로 변경하거나 `.ts` 파일로 분리하세요.

---

## 소스 위치의 줄 번호가 틀려요

Vite + `@vitejs/plugin-react` 환경에서 플러그인 순서가 잘못된 경우입니다.

`vitePlugin`은 반드시 `react()` 뒤에 선언하세요.

```ts
// vite.config.ts
plugins: [
  react(),
  vitePlugin(), // react() 뒤에
]
```

---

## Vite 환경에서 `enableReactComponentJump`가 두 번 호출돼요

`injectClient: true`(기본값)일 때 클라이언트 코드가 자동 주입됩니다. `main.tsx`에서 직접 호출하면 중복 실행됩니다.

자동 주입을 끄거나, 둘 중 하나만 사용하세요.

```ts
// vite.config.ts
vitePlugin({ injectClient: false })
```

```ts
// main.tsx
import { enableReactComponentJump } from "react-code-locator";
enableReactComponentJump();
```

---

## CRA (Create React App)에서 플러그인 적용이 안 돼요

CRA는 webpack 설정이 숨겨져 있어서 `react-app-rewired` 또는 `craco`가 필요합니다.

**react-app-rewired 사용:**

```bash
npm i -D react-app-rewired
```

```js
// config-overrides.js
const { webpackPlugin } = require("react-code-locator");

module.exports = {
  webpack(config) {
    config.plugins.push(webpackPlugin());
    return config;
  },
};
```

```json
// package.json scripts
"start": "react-app-rewired start",
"build": "react-app-rewired build"
```

---

## Next.js Turbopack 환경에서 동작하지 않아요

Turbopack은 현재 지원되지 않습니다. `next dev --turbo` 대신 기본 webpack 모드(`next dev`)를 사용하세요.
