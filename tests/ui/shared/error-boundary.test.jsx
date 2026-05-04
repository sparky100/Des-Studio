import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../../src/ui/shared/components.jsx';

const ThrowingChild = () => {
  throw new Error('render exploded');
};

describe('ErrorBoundary', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children unchanged when no render error occurs', () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('healthy child')).toBeInTheDocument();
  });

  it('renders fallback content when a child throws while rendering', () => {
    render(
      <ErrorBoundary title="Panel failed" message="Could not render panel.">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Panel failed')).toBeInTheDocument();
    expect(screen.getByText('Could not render panel.')).toBeInTheDocument();
    expect(screen.getByText('render exploded')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('shows Try again when onReset is supplied and invokes it', () => {
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingChild />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
