
The drop downs are confused - the queues  define who can be added. The drop downs should reflect this, a server cant be added to a customer queue

Need clarity on
ARRIVE(Customer) v ARRIVE(Customer, Queue)
Should ARRIVE(Customer) be a valid option
What does COMPLETE do - assume end to end customer service is complete

If a muti process model then how is first event modelled
release(Server) and ARRIVE(Patient, Consultant)

Perhaps drop down  options should be clear

Possibly ARRIVE(Customer, Queue) = Add Customer  to Queue

[V8] No B-Event with an ARRIVE(Type) effect was found — the simulation will have no entity arrivals. - how is this validated?

Why does No B-Event with an ARRIVE(Type) effect was found — the simulation will have no entity arrivals. trigger if (ARRIVE(Patient, TraigeQueue)) exists - which fires at t=0?

Shows "template" on event definition if event doesnt  fire at t=0, perhaps need alternate phrase, similarly if fires at t=0, could flag this as "Arrival event" rather than B-EVent. Or in all cases say B-Event though that seems superfluous 

textat top of screen says  **Macros:** `ARRIVE(Type)` · `COMPLETE()` · `RENEGE(ctx)` · `RENEGE_OLDEST(Type)`  - is this still valid - i think it is now  extended?

Set _t=999_ for template B-events (Service Complete, Renege) — never directly in initial FEL. - rephrase so that it aligns  with how this is done 

B-Events (Bound — scheduled in FEL) - just say B-Events (Bound)

C-events - again drop downs should only populated with valid options, 

Follow on events refer to "template" the user shouldn't see this

The model definition tab overflows if there are more than one server type, instead of showing the label for each just show a count of the entity type

I can assign an Effect selected from the Drop Down list that is not valid B: "Triage Complete" · Unknown effect: RELEASE(Triage Nurse)  shown in log file

Need more robust testing where queue names have spaces in particular how this aligns with the items generated from the B-Event and C-Event drop downs

The M/M/1 model is clear
What is more complex is a model with 2 server types an 2 queues.
Patient -> Queue1 -> Service 1 (server type 1) -> Queue 2-->Service 2 (server type 2) ->Complete

I would expect 
3 entities
3 B Events
	Customer Arrives - Customer added to Queue 1 
	 End Service 1 -  Releases Server Type 1, Customer Added to Queue 2
	 End Service 2	- Releases Server Type 2 
	  	
2 C Events
	Start Service Type 1, Schedules End Service 1 
	Start Service Type 2 , Schedules End Service 2

How is this effected with the current model definition

It's not clear when changes are saved or whether the Save button must always be used - if that is the case possibly move the save button closer to the entity definition, perhaps indicate when changes need to be saved

**AI Generation**

Entity Types define correctly, though assumption made on arrival time, perhaps prompt a question.
Spaces in queue names or capitalisation cause an issue , e.g this check queue(Post Office Queue).length > 0 generates this error [V9] C-Event 'Start Service' condition references unknown queue 'postofficequeue'.

The text on the queue definition says this Configure per-customer-type queue properties. Each **customer** type automatically has an implicit queue. Set _capacity_ for bounded queues (blank = unlimited). **Discipline:** FIFO (default), LIFO, or Priority. How does this work?

If I go to refine the model and change the distribution type it displays the JSON - is there a friendly way of doing this?

Is the model set to ask 2 questions?

The mapping of response should gather enough info to 

* * determine the number of entities for each type

* * determine the "customer" type in a queue

* Correctly assign a customer to a server*

Moving off the screen loses data - this may just be on dev server









