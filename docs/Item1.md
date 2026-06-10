
1. When a batch run is initiatedand completed  don't show the  details of each run
	1. show the metrics
	2.  show the batch runs collapsed - so they can be expended
	3. and thenhiostory etc...
2. On the page at the end of a run the completion rate should be a % i,e 0.3.=30% no decimal point
3. Results at end of run and accessed from the results tab history should have the same metrics. 	 They should be  
	1. Avg Wait, Avg Service, Sojourn, Time in system,
	2. Arrived, Served, Reneged,  Completion rate 
	3. Total Cost and Cost/Serve
4. There is no need for the explanatory text that is shown  in the on the results tab for these metrics
5. 6. 

iagnosis

The model has a critical routing defect: Majors and Resus patients successfully triage and begin consultation but never progress beyond that stage to investigations, observations, or discharge. Only the Minors fast-track pathway completes successfully. The Discharge Decision Queue remains empty throughout the simulation. This is likely due to missing or incorrect probabilistic routing in the consultation completion events (b_majors_consult_done, b_resus_consult_done) or missing RELEASE effects in the observation completion events that should route entities to the discharge queue.

CRITICALMajors and Resus patients never reach discharge

The simulation shows 164 Majors and 29 Resus patients entering their respective pathways but zero entities completing the Discharge Decision Queue or exiting via the discharge pathway. The trace shows majors_consult_done events firing repeatedly, but no entities ever progress to the Discharge Decision Queue. This indicates a broken routing chain after consultation or investigation/observation stages.

Fix: Verify that the probabilistic routing in b_majors_consult_done and b_resus_consult_done correctly routes entities to Majors/Resus Investigations or Observation queues, and that b_majors_inv_done, b_resus_inv_done, b_majors_obs_done, and b_resus_obs_done properly route entities to the Discharge Decision Queue.

Affected:Discharge Decision Queue

CRITICALOnly Minors pathway completes successfully

Run statistics show 100 Minors completed (via b_minors_done) but zero completions for Majors or Resus. The section statistics confirm sec_minors has 100 entities out with 0 incomplete, while sec_majors has 164 in with 0 out, and sec_resus has 29 in with 0 out. This indicates a fundamental blockage in the Majors and Resus pathways after triage.

Fix: Check that b_majors_consult_done and b_resus_consult_done have valid probabilistic routing defined and that the target queues (Majors/Resus Investigations and Observations) exist and are correctly named in the routing rules.

Affected:Majors and Resus pathways

CRITICALDischarge Decision Queue never receives entities

The Discharge Decision Queue has zero entities throughout the entire simulation despite being the exit point for Majors and Resus pathways. The c_start_discharge event never fires because the queue remains empty. This is a consequence of entities not progressing through investigations and observations.

Fix: Ensure that b_majors_obs_done and b_resus_obs_done events have RELEASE effects that route entities to the Discharge Decision Queue, not just release the Assessment Nurse resource.

Affected:Start Discharge Decision

WARNING67% of entities remain in-progress at simulation end

The terminatingState shows 195 entities waiting or serving at end of 1440-minute simulation, with only 100 served (33% completion rate). This indicates either insufficient capacity, very long service times in Majors/Resus pathways, or the routing blockage preventing completion.

Fix: After fixing the routing issue, review service time distributions (especially for investigations and observations) and staffing levels to ensure reasonable throughput for a 24-hour period.

WARNINGAverage time in system far exceeds NHS 4-hour target

avgTimeInSystem is 366 minutes (6+ hours), more than 50% above the 240-minute (4-hour) goal. This is driven by the incomplete Majors and Resus pathways; once routing is fixed, the actual wait times should be re-evaluated.

Fix: Rerun simulation after fixing routing to obtain accurate performance metrics against the NHS target.

Re-diagnose              