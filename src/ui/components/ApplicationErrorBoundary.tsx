import React from 'react';

export class ApplicationErrorBoundary extends React.Component<React.PropsWithChildren, {failed:boolean}> {
  state = {failed:false};
  private reference = `UI-${crypto.randomUUID()}`;
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch() { console.error(`UI render failure. Reference: ${this.reference}`); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="m-8 rounded border p-6"><h1>The interface encountered a problem.</h1><p>Reload the interface to recover. If this repeats, include this reference with your support report.</p><p>{this.reference}</p><button className="mt-3 rounded border px-4 py-2" onClick={() => window.location.reload()}>Reload Interface</button></main>;
  }
}
