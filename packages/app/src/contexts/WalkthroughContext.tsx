import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { WALKTHROUGH_STEPS } from './walkthroughSteps';

// Re-export so existing consumers don't break
export type { WalkthroughStep } from './walkthroughSteps';
export { WALKTHROUGH_STEPS } from './walkthroughSteps';

interface WalkthroughContextValue {
  isActive: boolean;
  currentStep: number;
  startTour: () => void;
  nextStep: () => void;
  dismissTour: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useWalkthrough(): WalkthroughContextValue {
  const context = useContext(WalkthroughContext);
  if (!context) throw new Error('useWalkthrough must be used within WalkthroughProvider');
  return context;
}

interface WalkthroughProviderProps {
  children: ReactNode;
}

export function WalkthroughProvider({ children }: WalkthroughProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const dismissTour = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEYS.WALKTHROUGH_SEEN, 'true');
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep + 1 >= WALKTHROUGH_STEPS.length) {
      dismissTour();
      setCurrentStep(0);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, dismissTour]);

  const value: WalkthroughContextValue = { isActive, currentStep, startTour, nextStep, dismissTour };

  return (
    <WalkthroughContext.Provider value={value}>
      {children}
    </WalkthroughContext.Provider>
  );
}
