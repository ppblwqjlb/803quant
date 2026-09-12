let nextRequestId = 0;

export function createResearchRequestGate() {
  let generation = 0;
  let active = true;
  return {
    begin: () => { generation = ++nextRequestId; return generation; },
    invalidate: () => { active = false; generation += 1; },
    isCurrent: (request: number) => active && request === generation,
  };
}
