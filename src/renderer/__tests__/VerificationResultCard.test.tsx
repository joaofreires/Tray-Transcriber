import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VerificationResultCard from '../settings/components/VerificationResultCard';

describe('VerificationResultCard', () => {
  it('renders dismiss error action and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <VerificationResultCard
        result={{
          ok: false,
          target: 'ocr',
          message: 'OCR verification failed.',
          error: 'request timeout'
        }}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
