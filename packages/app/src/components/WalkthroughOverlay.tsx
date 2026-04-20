import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WalkthroughStep } from '../contexts/WalkthroughContext';
import './WalkthroughOverlay.css';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface WalkthroughOverlayProps {
  isActive: boolean;
  currentStep: number;
  steps: WalkthroughStep[];
  onNext: () => void;
  onDismiss: () => void;
}

export function WalkthroughOverlay({ isActive, currentStep, steps, onNext, onDismiss }: WalkthroughOverlayProps) {
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const totalSteps = steps.length;

  useEffect(() => {
    if (!isActive || !step) return;

    function updateRect() {
      const el = document.querySelector(step.target);
      if (!el) { setSpotlightRect(null); return; }
      const r = el.getBoundingClientRect();
      setSpotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    updateRect();

    const el = document.querySelector(step.target);
    if (el) {
      observerRef.current = new ResizeObserver(updateRect);
      observerRef.current.observe(el);
    }

    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      observerRef.current?.disconnect();
    };
  }, [isActive, step]);

  if (!isActive || !step) return null;

  // Position card below spotlight, flip above if it overflows viewport bottom
  const CARD_HEIGHT = 160;
  const CARD_MARGIN = 12;
  let cardTop = spotlightRect
    ? spotlightRect.top + spotlightRect.height + CARD_MARGIN
    : window.innerHeight / 2 - CARD_HEIGHT / 2;
  if (spotlightRect && cardTop + CARD_HEIGHT > window.innerHeight - 16) {
    cardTop = spotlightRect.top - CARD_HEIGHT - CARD_MARGIN;
  }
  const cardLeft = spotlightRect
    ? Math.min(Math.max(spotlightRect.left, 16), window.innerWidth - 280 - 16)
    : window.innerWidth / 2 - 140;

  const overlay = (
    <div className="walkthrough-overlay" aria-modal="true" role="dialog" aria-label={`Tour step ${currentStep + 1} of ${totalSteps}: ${step.title}`}>
      {/* Spotlight cutout */}
      {spotlightRect && (
        <div
          className="walkthrough-spotlight"
          style={{
            top: spotlightRect.top - 4,
            left: spotlightRect.left - 4,
            width: spotlightRect.width + 8,
            height: spotlightRect.height + 8,
          }}
        />
      )}

      {/* Step card */}
      <div
        ref={cardRef}
        className="walkthrough-card"
        style={{ top: cardTop, left: cardLeft }}
      >
        <p className="walkthrough-counter">Step {currentStep + 1} of {totalSteps}</p>
        <h3 className="walkthrough-title">{step.title}</h3>
        <p className="walkthrough-body">{step.body}</p>
        <div className="walkthrough-actions">
          <button className="walkthrough-skip-btn" onClick={onDismiss} type="button">
            Skip tour
          </button>
          <button className="walkthrough-next-btn" onClick={onNext} type="button">
            {isLastStep ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
