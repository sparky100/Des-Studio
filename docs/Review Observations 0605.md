UI 
* In each case the text "JSON" in  "Import JSON" and "Export JSON" should say Model
* The options to fire at a start, should be Fire at start  or scheduled. I'm not sure how setting a time here adds value or works
* AI Generated Model should say "use AI"
* The "runs" field on the model tab doesnt always update

Model
The language in the drop down options could be improved

B Event e.g. Add Customer to Waiting - should be Add Customer to Waiting Queue
C Event effects - e.g. Replace "Start Customer with Waiting from Server" as "Start Service with Server and Customer from Waiting Queue"  where Service is the name of the C-event

Visual designer
* should an Source generate an Arrival event that has a Follow on event of Arrival
* Not sure of the purpose of the Nodes
* Need layout capability assume future feature

AI Generaor
* B Events If a arrival pattern  is defined it should be able to work out that a customer is added to a queue.. i.e effect added
* C events If a service is defined it should define an effect
* C Events if a Follow on B Event is defined it should always default to Pass Entity COntext

Implementation notes
* Review coherence pass started 06 May 2026.
* Highest-priority fixes: infer AI ARRIVE/service effects, default follow-on entity context, relabel Import/Export as Model, rename AI tab to Use AI, clarify Fire at start, improve B/C-event service wording, and refresh run counts after saved runs.
