import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App', () => {
  it('renders header and navigation tabs', () => {
    render(<App />);
    expect(screen.getByText(/Tray Transcriber/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /workspace record, transcribe, and assist/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /settings device, model and app preferences/i })).toBeDefined();
  });
});
