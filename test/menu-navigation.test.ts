import { describe, expect, it } from 'vitest';

import {
  handlePromptCancel,
  handleUnavailableMenuChoice,
  isMenuBackSignal,
  menuIntroTitle,
  MenuBackSignal,
} from '../src/menu-navigation.js';

describe('menu navigation', () => {
  it('turns menu prompt cancellation into a back-navigation signal', () => {
    expect(() => handlePromptCancel(true, 'back')).toThrow(MenuBackSignal);

    try {
      handlePromptCancel(true, 'back');
    } catch (error) {
      expect(isMenuBackSignal(error)).toBe(true);
    }
  });

  it('ignores submitted prompt values', () => {
    expect(() => handlePromptCancel(false, 'back')).not.toThrow();
  });

  it('adds a concise back hint to submenu intros', () => {
    expect(menuIntroTitle('Remove module', 'back')).toBe('Remove module · Esc to go back');
    expect(menuIntroTitle('Remove module', 'exit')).toBe('Remove module');
  });

  it('returns to the menu from empty submenu states', () => {
    expect(() => handleUnavailableMenuChoice('back')).toThrow(MenuBackSignal);
    expect(() => handleUnavailableMenuChoice('exit')).not.toThrow();
  });
});
