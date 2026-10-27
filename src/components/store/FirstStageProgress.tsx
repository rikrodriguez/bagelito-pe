"use client";

import { FIRST_STAGE_PROGRESS, progressPosition, type FirstStageStep } from "@/lib/storefront-first-stage";

type Props = {
  step: FirstStageStep;
  onEntry: () => void;
  onCategory: () => void;
  onSize: () => void;
};

export function FirstStageProgress({ step, onEntry, onCategory, onSize }: Props) {
  const current = progressPosition(step);
  return (
    <nav className="first-stage-progress" aria-label="Progreso de compra">
      {FIRST_STAGE_PROGRESS.map((label, index) => {
        const reachable = index <= Math.min(current, 2);
        const action = index === 0 ? onEntry : index === 1 ? onCategory : onSize;
        const content = <><span>{index + 1}</span><strong>{label}</strong></>;

        return (
          <div
            key={label}
            className={
              "first-stage-progress-item" +
              (index === current ? " active" : "") +
              (index < current ? " complete" : "")
            }
          >
            {reachable ? (
              <button type="button" aria-current={index === current ? "step" : undefined} onClick={action}>
                {content}
              </button>
            ) : (
              <span className="first-stage-progress-future" aria-current={index === current ? "step" : undefined}>
                {content}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
