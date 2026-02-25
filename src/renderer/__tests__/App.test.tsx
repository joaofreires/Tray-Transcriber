import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App', () => {
  it('renders header and navigation tabs', () => {
    render(<App />);
    expect(screen.getByText(/Tray Transcriber/i)).toBeDefined();
    expect(screen.getByText(/Workspace/i)).toBeDefined();
    expect(screen.getByText(/Settings/i)).toBeDefined();
  });
});
