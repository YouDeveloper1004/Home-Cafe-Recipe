export type AppScreen = 'home' | 'saved' | 'profile' | 'create_cafe' | 'create_recipe' | 'cafe' | 'detail' | 'brew' | 'complete';

export function pushScreen(stack: AppScreen[], nextScreen: AppScreen): AppScreen[] {
  if (stack[stack.length - 1] === nextScreen) return stack;
  return [...stack, nextScreen];
}

export function popScreen(stack: AppScreen[]): AppScreen[] {
  return stack.length > 1 ? stack.slice(0, -1) : ['home'];
}

export function leaveCafe(stack: AppScreen[]): AppScreen[] {
  const parentScreens: AppScreen[] = ['home', 'saved', 'profile'];

  // 과거 상태에 Cafe와 레시피가 교차해 쌓여 있어도 모두 건너뛰고
  // 사용자가 Cafe를 열기 전에 있던 최상위 화면으로 돌아간다.
  for (let index = stack.length - 2; index >= 0; index -= 1) {
    if (parentScreens.includes(stack[index])) {
      return stack.slice(0, index + 1);
    }
  }

  return ['home'];
}

export function replaceScreen(stack: AppScreen[], nextScreen: AppScreen): AppScreen[] {
  const previousScreens = stack.slice(0, -1);

  // Cafe → 레시피 → 같은 Cafe처럼 직전 경로와 합쳐지는 경우,
  // 현재 화면을 제거해 Cafe가 중복으로 쌓이지 않게 한다.
  if (previousScreens[previousScreens.length - 1] === nextScreen) {
    return previousScreens;
  }

  return [...previousScreens, nextScreen];
}

export function resetStack(nextScreen: AppScreen): AppScreen[] {
  return [nextScreen];
}
