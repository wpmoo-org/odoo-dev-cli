import { describe, expect, it } from 'vitest';

import {
  consumePromptCancelKey,
  handlePromptCancel,
  handleUnavailableMenuChoice,
  isMenuBackSignal,
  menuActionLabel,
  menuIntroTitle,
  MenuBackSignal,
  promptCancelOutcome,
  recordPromptCancelKey,
} from '../src/menu-navigation.js';

describe('menu navigation', () => {
  it('turns menu prompt cancellation into a back-navigation signal', () => {
    recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
    expect(() => handlePromptCancel(true, 'back')).toThrow(MenuBackSignal);

    try {
      recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
      handlePromptCancel(true, 'back');
    } catch (error) {
      expect(isMenuBackSignal(error)).toBe(true);
    }
  });

  it('ignores submitted prompt values', () => {
    expect(() => handlePromptCancel(false, 'back')).not.toThrow();
  });

  it('adds a concise back hint to submenu intros', () => {
    expect(menuIntroTitle('Remove module', 'back')).toBe('Remove module · Back (Esc)');
    expect(menuIntroTitle('Remove module', 'exit')).toBe('Remove module');
  });

  it('adds the back hint to menu action labels', () => {
    expect(menuActionLabel('Remove module from source repo', 'back')).toBe(
      'Remove module from source repo (Esc: Back to previous menu)',
    );
    expect(menuActionLabel('Exit', 'exit')).toBe('Exit');
  });

  it('returns to the menu from empty submenu states', () => {
    expect(() => handleUnavailableMenuChoice('back')).toThrow(MenuBackSignal);
    expect(() => handleUnavailableMenuChoice('exit')).not.toThrow();
  });

  it('treats Ctrl+C as exit even in back-enabled menus', () => {
    expect(promptCancelOutcome(true, 'back', 'interrupt')).toBe('exit');
    expect(promptCancelOutcome(true, 'back', 'escape')).toBe('back');
    expect(promptCancelOutcome(false, 'back', 'interrupt')).toBe('continue');
  });

  it('records and consumes the key that caused a prompt cancellation', () => {
    recordPromptCancelKey({ ctrl: true, name: 'c', sequence: '\u0003' });
    expect(consumePromptCancelKey()).toBe('interrupt');
    expect(consumePromptCancelKey()).toBeUndefined();

    recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
    expect(consumePromptCancelKey()).toBe('escape');
  });
});
