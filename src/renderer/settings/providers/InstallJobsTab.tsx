import React from 'react';
import { panelSurface, type InstallJob } from '../types';

type InstallJobsTabProps = {
  jobs: InstallJob[];
  onCheckUpdates: () => Promise<void>;
};

export default function InstallJobsTab({ jobs, onCheckUpdates }: InstallJobsTabProps) {
  return (
    <section className={panelSurface}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm uppercase tracking-[0.28em] text-white/60">Install Jobs</h3>
        <button className="rounded-xl border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10" onClick={onCheckUpdates}>
          Check updates
        </button>
      </div>
      <div className="grid gap-2 max-h-56 overflow-auto">
        {jobs.length === 0 ? <p className="text-white/50 text-sm">No installer jobs yet.</p> : null}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-white/80">{job.providerId}</span>
              <span className="text-white/60">{job.state}</span>
            </div>
            <p className="text-white/50">{job.action} • {new Date(job.createdAt).toLocaleString()}</p>
            {job.message ? <p className="text-white/70">{job.message}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

