import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

const SimpleComponent = () => <div>jsdom is working</div>;

describe('jsdom smoke test', () => {
  it('renders a React component in jsdom', () => {
    render(<SimpleComponent />);
    expect(screen.getByText('jsdom is working')).toBeInTheDocument();
  });
});
