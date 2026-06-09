
Charts
Can we have a look again at what is available in the results file from batches for review and also the LLM

I think we should store data that allows us to answer questions on waiting times and be able to view historic graphs - collect data, assess size if over x - say can't be saved - we should only be storing a reduced set of sample data - can data not be aggregated - to create graphs and provide queue waiting time data if not available

Can we look again at allowing chart data to - as it is visually helpful to see this and may help with other goals

Numbers
Counts in sections and journey outcomes are totals rather than the avg per run - change it to avg per run

Ensure that any report or export generated from a batch run makes  the average counts prominent and total counts less so (if even required)

LLM guidance
review what goals can be set and accurately reported against. The UI currently constrains this but the 

Sections
How does a user need to set in / Out status of  queues to get counts through sections. Is the guidance in the LLM schema sufficient?

Additional Notes

Ordering of effects is import set SET ATTR e.g. must come after ARRIVE/ASSIGN/COSEIZE (V44) LLM Need to understand this - do we need to modify the LLM schema doc

For a large model an  LLM should ensure that all events and queues are linked to a section. Emphasise use of In and Out from a stage

An LLM should only be able to set a Performance Goal that is measured. The UI restricts this. Indicate to the LLM that the only high level measures are x. Explore is there an alternative 

The define model identifies what errors there are. Clicking  on a warning or  error in an entry form should filter the list to show the affected errors. Users  should be able to remove the filter


--
Managing runs with a large WIP

Some changes have been implemented to better represent journey and wait times when there is a significant amount of WIP. Please review  these changes 

Some immediate changes

The message "Large unfinished backlog — results may be unreliable. Increase max sim time or enable the purge period in Run Setup." could be amended to suggest a careful review of the model to identify where the bottlenecks are occurring

for a run of batches 5123 entities still in progress (71% of arrivals) — 162 serving, 4961 waiting - should be averaged per run rather than totals.

or shown % after serving and waiting numbers - to show the split

**Should `avgSvc` also be fixed to include in-progress partial service times** (like we fixed `avgWait`), or is a warning sufficient? Partial service times would need half-weighting and could be added to `avgSvc` similar to how in-progress waits were added to `avgWait`.

this must work across individual runs, batch runs and explore and also feed through to any results UI and results export


Thoughts ? and proposals,
