// Build Heat Pump v2 model with RASE pattern + working-day clock
// Run: node build-rase-model.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const model = {
  "name": "Heat pump v2 — RASE + Scheduling",
  "model_json": {
    "schemaVersion": 1,
    "entityTypes": [
      {
        "id": "et_urban_hh",
        "name": "Urban Household",
        "role": "customer",
        "count": 0,
        "attrDefs": [
          { "name": "priority", "mutable": true, "valueType": "number", "defaultValue": 2 },
          { "name": "dno_risk", "mutable": false, "valueType": "number", "defaultValue": 1 }
        ]
      },
      {
        "id": "et_suburban_hh",
        "name": "Suburban Household",
        "role": "customer",
        "count": 0,
        "attrDefs": [
          { "name": "priority", "mutable": true, "valueType": "number", "defaultValue": 2 },
          { "name": "dno_risk", "mutable": false, "valueType": "number", "defaultValue": 2 }
        ]
      },
      {
        "id": "et_rural_hh",
        "name": "Rural Household",
        "role": "customer",
        "count": 0,
        "attrDefs": [
          { "name": "priority", "mutable": true, "valueType": "number", "defaultValue": 3 },
          { "name": "dno_risk", "mutable": false, "valueType": "number", "defaultValue": 3 }
        ]
      },
      {
        "id": "et_trainee",
        "name": "Installer Trainee",
        "role": "customer",
        "count": 0,
        "attrDefs": [
          { "name": "priority", "mutable": false, "valueType": "number", "defaultValue": 1 }
        ]
      },
      {
        "id": "et_surveyor",
        "name": "MCS Surveyor",
        "role": "server",
        "count": 4,
        "attrDefs": [],
        "shiftSchedule": [
          { "time": 0, "capacity": 4 },
          { "time": 86, "capacity": 5 },
          { "time": 171, "capacity": 6 }
        ]
      },
      {
        "id": "et_installer",
        "name": "Heat Pump Installer",
        "role": "server",
        "count": 6,
        "attrDefs": [],
        "shiftSchedule": [
          { "time": 0, "capacity": 6 },
          { "time": 129, "capacity": 8 },
          { "time": 214, "capacity": 10 }
        ]
      },
      {
        "id": "et_dno_officer",
        "name": "DNO Officer",
        "role": "server",
        "count": 3,
        "attrDefs": []
      },
      {
        "id": "et_dno_crew",
        "name": "DNO Field Crew",
        "role": "server",
        "count": 2,
        "attrDefs": []
      },
      {
        "id": "et_commissioning",
        "name": "Commissioning Engineer",
        "role": "server",
        "count": 4,
        "attrDefs": []
      },
      {
        "id": "et_training",
        "name": "Training Capacity",
        "role": "server",
        "count": 8,
        "attrDefs": []
      }
    ],
    "stateVariables": [
      { "id": "sv_rural_blocked", "name": "ruralBlocked", "valueType": "number", "initialValue": 0, "resetOnWarmup": true },
      { "id": "sv_trainees_qualified", "name": "traineesQualified", "valueType": "number", "initialValue": 0, "resetOnWarmup": true }
    ],
    "bEvents": [
      {
        "id": "b_urban_arrives",
        "name": "Urban Household Applies",
        "effect": ["ARRIVE(Urban Household, Urban Assessment Queue)"],
        "schedules": [{
          "dist": "Piecewise",
          "eventId": "b_urban_arrives",
          "distParams": {
            "periods": [
              { "dist": "Exponential", "startTime": "0", "distParams": { "mean": "1.78" } },
              { "dist": "Exponential", "startTime": "260", "distParams": { "mean": "99999" } }
            ]
          }
        }],
        "scheduledTime": "0"
      },
      {
        "id": "b_suburban_arrives",
        "name": "Suburban Household Applies",
        "effect": ["ARRIVE(Suburban Household, Suburban Assessment Queue)"],
        "schedules": [{
          "dist": "Piecewise",
          "eventId": "b_suburban_arrives",
          "distParams": {
            "periods": [
              { "dist": "Exponential", "startTime": "0", "distParams": { "mean": "1.78" } },
              { "dist": "Exponential", "startTime": "260", "distParams": { "mean": "99999" } }
            ]
          }
        }],
        "scheduledTime": "0"
      },
      {
        "id": "b_rural_arrives",
        "name": "Rural Household Applies",
        "effect": ["ARRIVE(Rural Household, Rural Assessment Queue)"],
        "schedules": [{
          "dist": "Piecewise",
          "eventId": "b_rural_arrives",
          "distParams": {
            "periods": [
              { "dist": "Exponential", "startTime": "0", "distParams": { "mean": "3.56" } },
              { "dist": "Exponential", "startTime": "260", "distParams": { "mean": "99999" } }
            ]
          }
        }],
        "scheduledTime": "0"
      },
      {
        "id": "b_trainee_arrives",
        "name": "Trainee Intake",
        "effect": ["ARRIVE(Installer Trainee, Installer Training Queue)"],
        "schedules": [{
          "dist": "Piecewise",
          "eventId": "b_trainee_arrives",
          "distParams": {
            "periods": [
              { "dist": "Exponential", "startTime": "0", "distParams": { "mean": "10.0" } },
              { "dist": "Exponential", "startTime": "260", "distParams": { "mean": "99999" } }
            ]
          }
        }],
        "scheduledTime": "0"
      },
      // --- Existing completion B-events (unchanged structure, service times on C-events) ---
      {
        "id": "b_urban_assessed",
        "name": "Urban Assessment Complete",
        "effect": ["RELEASE(MCS Surveyor, Urban DNO Desk Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_suburban_assessed",
        "name": "Suburban Assessment Complete",
        "effect": ["RELEASE(MCS Surveyor, Suburban DNO Desk Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_rural_assessed",
        "name": "Rural Assessment Complete",
        "effect": ["RELEASE(MCS Surveyor, Rural DNO Desk Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_urban_dno_reviewed",
        "name": "Urban DNO Review Complete",
        "effect": ["RELEASE(DNO Officer)"],
        "schedules": [],
        "scheduledTime": "9999",
        "probabilisticRouting": [
          { "queueName": "Urban Reinf Schedule Queue", "probability": 0.15 },
          { "queueName": "Urban Install Schedule Queue", "probability": 0.85 }
        ]
      },
      {
        "id": "b_suburban_dno_reviewed",
        "name": "Suburban DNO Review Complete",
        "effect": ["RELEASE(DNO Officer)"],
        "schedules": [],
        "scheduledTime": "9999",
        "probabilisticRouting": [
          { "queueName": "Suburban Reinf Schedule Queue", "probability": 0.35 },
          { "queueName": "Suburban Install Schedule Queue", "probability": 0.65 }
        ]
      },
      {
        "id": "b_rural_dno_reviewed",
        "name": "Rural DNO Review Complete",
        "effect": ["RELEASE(DNO Officer)"],
        "schedules": [],
        "scheduledTime": "9999",
        "probabilisticRouting": [
          { "queueName": "Rural Reinf Schedule Queue", "probability": 0.7 },
          { "queueName": "Rural Install Schedule Queue", "probability": 0.3 }
        ]
      },
      // --- Reinforcement completion B-events now route to INSTALL SCHEDULE queue ---
      {
        "id": "b_urban_reinforced",
        "name": "Urban Reinforcement Complete",
        "effect": ["RELEASE(DNO Field Crew, Urban Install Schedule Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_suburban_reinforced",
        "name": "Suburban Reinforcement Complete",
        "effect": ["RELEASE(DNO Field Crew, Suburban Install Schedule Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_rural_reinforced",
        "name": "Rural Reinforcement Complete",
        "effect": ["RELEASE(DNO Field Crew, Rural Install Schedule Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      // --- Installation and commissioning B-events (unchanged) ---
      {
        "id": "b_urban_installed",
        "name": "Urban Installation Complete",
        "effect": ["RELEASE(Heat Pump Installer, Urban Commissioning Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_suburban_installed",
        "name": "Suburban Installation Complete",
        "effect": ["RELEASE(Heat Pump Installer, Suburban Commissioning Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_rural_installed",
        "name": "Rural Installation Complete",
        "effect": ["RELEASE(Heat Pump Installer, Rural Commissioning Queue)"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_urban_commissioned",
        "name": "Urban Commissioned",
        "effect": ["COMPLETE()"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_suburban_commissioned",
        "name": "Suburban Commissioned",
        "effect": ["COMPLETE()"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_rural_commissioned",
        "name": "Rural Commissioned",
        "effect": ["COMPLETE()"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      {
        "id": "b_trainee_qualified",
        "name": "Trainee Qualifies",
        "effect": ["COMPLETE()"],
        "schedules": [],
        "scheduledTime": "9999"
      },
      // === NEW: Routing B-events for scheduling delays ===
      { "id": "b_urban_reinf_scheduled", "name": "Urban DNO Reinforcement Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Urban Reinforcement Queue", "probability": 1 }] },
      { "id": "b_suburban_reinf_scheduled", "name": "Suburban DNO Reinforcement Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Suburban Reinforcement Queue", "probability": 1 }] },
      { "id": "b_rural_reinf_scheduled", "name": "Rural DNO Reinforcement Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Rural Reinforcement Queue", "probability": 1 }] },
      { "id": "b_urban_install_scheduled", "name": "Urban Installation Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Urban Installation Queue", "probability": 1 }] },
      { "id": "b_suburban_install_scheduled", "name": "Suburban Installation Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Suburban Installation Queue", "probability": 1 }] },
      { "id": "b_rural_install_scheduled", "name": "Rural Installation Scheduled", "effect": [], "schedules": [], "scheduledTime": "9999", "probabilisticRouting": [{ "queueName": "Rural Installation Queue", "probability": 1 }] }
    ],
    "cEvents": [
      // Assessment
      { "id": "c_assess_urban", "name": "Assess Urban", "effect": ["ASSIGN(Urban Assessment Queue, MCS Surveyor)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Urban Assessment Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(MCS Surveyor).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_assessed", "distParams": { "max": "2.0", "min": "0.5", "mode": "1.0" }, "useEntityCtx": true }] },
      { "id": "c_assess_suburban", "name": "Assess Suburban", "effect": ["ASSIGN(Suburban Assessment Queue, MCS Surveyor)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Suburban Assessment Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(MCS Surveyor).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_assessed", "distParams": { "max": "2.0", "min": "0.5", "mode": "1.0" }, "useEntityCtx": true }] },
      { "id": "c_assess_rural", "name": "Assess Rural", "effect": ["ASSIGN(Rural Assessment Queue, MCS Surveyor)"], "priority": 2,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Rural Assessment Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(MCS Surveyor).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_assessed", "distParams": { "max": "3.0", "min": "0.75", "mode": "1.5" }, "useEntityCtx": true }] },
      // DNO desk review — rural first (pri 1), then suburban (pri 2), urban last (pri 3)
      { "id": "c_dno_review_rural", "name": "DNO Review Rural", "effect": ["ASSIGN(Rural DNO Desk Queue, DNO Officer)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Rural DNO Desk Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Officer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_dno_reviewed", "distParams": { "max": "10", "min": "2", "mode": "5" }, "useEntityCtx": true }] },
      { "id": "c_dno_review_suburban", "name": "DNO Review Suburban", "effect": ["ASSIGN(Suburban DNO Desk Queue, DNO Officer)"], "priority": 2,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Suburban DNO Desk Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Officer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_dno_reviewed", "distParams": { "max": "7", "min": "1.5", "mode": "3.5" }, "useEntityCtx": true }] },
      { "id": "c_dno_review_urban", "name": "DNO Review Urban", "effect": ["ASSIGN(Urban DNO Desk Queue, DNO Officer)"], "priority": 3,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Urban DNO Desk Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Officer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_dno_reviewed", "distParams": { "max": "5", "min": "1.5", "mode": "3" }, "useEntityCtx": true }] },
      // Reinforcement — rural first (pri 1), Lognormal for right-skewed service variation
      { "id": "c_reinforce_rural", "name": "Reinforce Rural", "effect": ["ASSIGN(Rural Reinforcement Queue, DNO Field Crew)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Rural Reinforcement Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Field Crew).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Lognormal", "eventId": "b_rural_reinforced", "distParams": { "logMean": "3.3", "logStdDev": "0.6" }, "useEntityCtx": true }] },
      { "id": "c_reinforce_suburban", "name": "Reinforce Suburban", "effect": ["ASSIGN(Suburban Reinforcement Queue, DNO Field Crew)"], "priority": 2,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Suburban Reinforcement Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Field Crew).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Lognormal", "eventId": "b_suburban_reinforced", "distParams": { "logMean": "2.7", "logStdDev": "0.6" }, "useEntityCtx": true }] },
      { "id": "c_reinforce_urban", "name": "Reinforce Urban", "effect": ["ASSIGN(Urban Reinforcement Queue, DNO Field Crew)"], "priority": 3,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Urban Reinforcement Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(DNO Field Crew).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Lognormal", "eventId": "b_urban_reinforced", "distParams": { "logMean": "2.1", "logStdDev": "0.5" }, "useEntityCtx": true }] },
      // Installation — service times divided by 1.4
      { "id": "c_install_urban", "name": "Install Urban", "effect": ["ASSIGN(Urban Installation Queue, Heat Pump Installer)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Urban Installation Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Heat Pump Installer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_installed", "distParams": { "max": "2.0", "min": "0.75", "mode": "1.0" }, "useEntityCtx": true }] },
      { "id": "c_install_suburban", "name": "Install Suburban", "effect": ["ASSIGN(Suburban Installation Queue, Heat Pump Installer)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Suburban Installation Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Heat Pump Installer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_installed", "distParams": { "max": "3", "min": "0.75", "mode": "1.5" }, "useEntityCtx": true }] },
      { "id": "c_install_rural", "name": "Install Rural", "effect": ["ASSIGN(Rural Installation Queue, Heat Pump Installer)"], "priority": 2,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Rural Installation Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Heat Pump Installer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_installed", "distParams": { "max": "4", "min": "1.5", "mode": "2" }, "useEntityCtx": true }] },
      // Commissioning
      { "id": "c_commission_urban", "name": "Commission Urban", "effect": ["ASSIGN(Urban Commissioning Queue, Commissioning Engineer)"], "priority": 0,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Urban Commissioning Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Commissioning Engineer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_commissioned", "distParams": { "max": "1.0", "min": "0.25", "mode": "0.5" }, "useEntityCtx": true }] },
      { "id": "c_commission_suburban", "name": "Commission Suburban", "effect": ["ASSIGN(Suburban Commissioning Queue, Commissioning Engineer)"], "priority": 0,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Suburban Commissioning Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Commissioning Engineer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_commissioned", "distParams": { "max": "1.0", "min": "0.25", "mode": "0.5" }, "useEntityCtx": true }] },
      { "id": "c_commission_rural", "name": "Commission Rural", "effect": ["ASSIGN(Rural Commissioning Queue, Commissioning Engineer)"], "priority": 0,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Rural Commissioning Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Commissioning Engineer).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_commissioned", "distParams": { "max": "1.5", "min": "0.25", "mode": "0.75" }, "useEntityCtx": true }] },
      // Training
      { "id": "c_train_installer", "name": "Train Installer", "effect": ["ASSIGN(Installer Training Queue, Training Capacity)"], "priority": 1,
        "condition": { "operator": "AND", "clauses": [{ "variable": "queue(Installer Training Queue).length", "operator": ">", "value": 0 }, { "variable": "idle(Training Capacity).count", "operator": ">", "value": 0 }] },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_trainee_qualified", "distParams": { "max": "64", "min": "29", "mode": "50" }, "useEntityCtx": true }] },
      // === NEW: DELAY-based scheduling C-events ===
      // DNO Reinforcement Scheduling — rural first for consistency
      { "id": "c_schedule_reinf_rural", "name": "Schedule DNO Reinforce Rural", "effect": ["DELAY(Rural Reinf Schedule Queue)"], "priority": 4,
        "condition": { "variable": "queue(Rural Reinf Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_reinf_scheduled", "distParams": { "min": "5", "mode": "10", "max": "21" }, "useEntityCtx": true }] },
      { "id": "c_schedule_reinf_suburban", "name": "Schedule DNO Reinforce Suburban", "effect": ["DELAY(Suburban Reinf Schedule Queue)"], "priority": 5,
        "condition": { "variable": "queue(Suburban Reinf Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_reinf_scheduled", "distParams": { "min": "3", "mode": "7", "max": "14" }, "useEntityCtx": true }] },
      { "id": "c_schedule_reinf_urban", "name": "Schedule DNO Reinforce Urban", "effect": ["DELAY(Urban Reinf Schedule Queue)"], "priority": 6,
        "condition": { "variable": "queue(Urban Reinf Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_reinf_scheduled", "distParams": { "min": "3", "mode": "7", "max": "14" }, "useEntityCtx": true }] },
      // Installation Scheduling
      { "id": "c_schedule_install_rural", "name": "Schedule Install Rural", "effect": ["DELAY(Rural Install Schedule Queue)"], "priority": 7,
        "condition": { "variable": "queue(Rural Install Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_rural_install_scheduled", "distParams": { "min": "5", "mode": "10", "max": "15" }, "useEntityCtx": true }] },
      { "id": "c_schedule_install_suburban", "name": "Schedule Install Suburban", "effect": ["DELAY(Suburban Install Schedule Queue)"], "priority": 8,
        "condition": { "variable": "queue(Suburban Install Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_suburban_install_scheduled", "distParams": { "min": "5", "mode": "10", "max": "15" }, "useEntityCtx": true }] },
      { "id": "c_schedule_install_urban", "name": "Schedule Install Urban", "effect": ["DELAY(Urban Install Schedule Queue)"], "priority": 9,
        "condition": { "variable": "queue(Urban Install Schedule Queue).length", "operator": ">", "value": 0 },
        "cSchedules": [{ "dist": "Triangular", "eventId": "b_urban_install_scheduled", "distParams": { "min": "5", "mode": "10", "max": "15" }, "useEntityCtx": true }] }
    ],
    "queues": [
      { "id": "q_urban_assess", "name": "Urban Assessment Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_assess", "name": "Suburban Assessment Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_assess", "name": "Rural Assessment Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      { "id": "q_urban_dno_desk", "name": "Urban DNO Desk Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_dno_desk", "name": "Suburban DNO Desk Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_dno_desk", "name": "Rural DNO Desk Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      { "id": "q_urban_reinf", "name": "Urban Reinforcement Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_reinf", "name": "Suburban Reinforcement Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_reinf", "name": "Rural Reinforcement Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      // === NEW: Scheduling queues ===
      { "id": "q_urban_reinf_schedule", "name": "Urban Reinf Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_reinf_schedule", "name": "Suburban Reinf Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_reinf_schedule", "name": "Rural Reinf Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      { "id": "q_urban_install_schedule", "name": "Urban Install Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_install_schedule", "name": "Suburban Install Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_install_schedule", "name": "Rural Install Schedule Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      // Existing queues (unchanged)
      { "id": "q_urban_install", "name": "Urban Installation Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_install", "name": "Suburban Installation Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_install", "name": "Rural Installation Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      { "id": "q_urban_commission", "name": "Urban Commissioning Queue", "capacity": "", "discipline": "FIFO", "customerType": "Urban Household" },
      { "id": "q_suburban_commission", "name": "Suburban Commissioning Queue", "capacity": "", "discipline": "FIFO", "customerType": "Suburban Household" },
      { "id": "q_rural_commission", "name": "Rural Commissioning Queue", "capacity": "", "discipline": "FIFO", "customerType": "Rural Household" },
      { "id": "q_training", "name": "Installer Training Queue", "capacity": "", "discipline": "FIFO", "customerType": "Installer Trainee" }
    ],
    "containerTypes": [],
    "goals": [
      { "label": "Mean end-to-end journey < 65 working days (≈90 calendar)", "metric": "summary.avgSojourn", "target": 65, "operator": "<" },
      { "label": "≥70% of applications complete within the simulation year", "metric": "summary.servedRatio", "target": 0.7, "operator": ">=" },
      { "label": "Mean rural reinforcement wait < 21 working days (≈30 calendar)", "scope": { "id": "q_rural_reinf", "name": "Rural Reinforcement Queue", "type": "queue" }, "metric": "summary.avgWait", "target": 21, "operator": "<" },
      { "label": "Mean suburban reinforcement wait < 11 working days (≈15 calendar)", "scope": { "id": "q_suburban_reinf", "name": "Suburban Reinforcement Queue", "type": "queue" }, "metric": "summary.avgWait", "target": 11, "operator": "<" },
      { "label": "DNO Field Crew utilisation < 80% (constraint headroom)", "scope": { "id": "et_dno_crew", "name": "DNO Field Crew", "type": "resource" }, "metric": "resource.utilisation", "target": 0.8, "operator": "<" },
      { "label": "Heat Pump Installer utilisation > 60% (workforce not idle)", "scope": { "id": "et_installer", "name": "Heat Pump Installer", "type": "resource" }, "metric": "resource.utilisation", "target": 0.6, "operator": ">" },
      { "label": "Rural reinforcement WIP < 10 households (queue not exploding)", "scope": { "id": "q_rural_reinf", "name": "Rural Reinforcement Queue", "type": "queue" }, "metric": "summary.avgWIP", "target": 10, "operator": "<" },
      { "label": "90th-percentile rural reinforcement wait < 43 working days (≈60 calendar)", "scope": { "id": "q_rural_reinf", "name": "Rural Reinforcement Queue", "type": "queue" }, "metric": "summary.avgWait", "target": 43, "operator": "p90" }
    ],
    "graph": {
      "nodes": [
        // Sources
        { "x": 40, "y": 80, "id": "source:b_urban_arrives-0", "type": "source", "refId": "b_urban_arrives" },
        { "x": 40, "y": 204, "id": "source:b_suburban_arrives-0", "type": "source", "refId": "b_suburban_arrives" },
        { "x": 40, "y": 328, "id": "source:b_rural_arrives-0", "type": "source", "refId": "b_rural_arrives" },
        { "x": 40, "y": 552, "id": "source:b_trainee_arrives-0", "type": "source", "refId": "b_trainee_arrives" },
        // Assessment queues
        { "x": 232, "y": 80, "id": "queue:q_urban_assess", "type": "queue", "refId": "q_urban_assess" },
        { "x": 232, "y": 204, "id": "queue:q_suburban_assess", "type": "queue", "refId": "q_suburban_assess" },
        { "x": 232, "y": 328, "id": "queue:q_rural_assess", "type": "queue", "refId": "q_rural_assess" },
        // Assessment activities
        { "x": 424, "y": 80, "id": "activity:c_assess_urban", "type": "activity", "refId": "c_assess_urban" },
        { "x": 424, "y": 204, "id": "activity:c_assess_suburban", "type": "activity", "refId": "c_assess_suburban" },
        { "x": 424, "y": 328, "id": "activity:c_assess_rural", "type": "activity", "refId": "c_assess_rural" },
        // DNO desk queues
        { "x": 660, "y": 80, "id": "queue:q_urban_dno_desk", "type": "queue", "refId": "q_urban_dno_desk" },
        { "x": 660, "y": 204, "id": "queue:q_suburban_dno_desk", "type": "queue", "refId": "q_suburban_dno_desk" },
        { "x": 660, "y": 328, "id": "queue:q_rural_dno_desk", "type": "queue", "refId": "q_rural_dno_desk" },
        // DNO review activities
        { "x": 852, "y": 80, "id": "activity:c_dno_review_urban", "type": "activity", "refId": "c_dno_review_urban" },
        { "x": 852, "y": 204, "id": "activity:c_dno_review_suburban", "type": "activity", "refId": "c_dno_review_suburban" },
        { "x": 852, "y": 328, "id": "activity:c_dno_review_rural", "type": "activity", "refId": "c_dno_review_rural" },
        // === NEW: Reinf schedule queues ===
        { "x": 940, "y": 138, "id": "queue:q_urban_reinf_schedule", "type": "queue", "refId": "q_urban_reinf_schedule" },
        { "x": 940, "y": 262, "id": "queue:q_suburban_reinf_schedule", "type": "queue", "refId": "q_suburban_reinf_schedule" },
        { "x": 940, "y": 386, "id": "queue:q_rural_reinf_schedule", "type": "queue", "refId": "q_rural_reinf_schedule" },
        // === NEW: Reinf schedule activities ===
        { "x": 1000, "y": 138, "id": "activity:c_schedule_reinf_urban", "type": "activity", "refId": "c_schedule_reinf_urban" },
        { "x": 1000, "y": 262, "id": "activity:c_schedule_reinf_suburban", "type": "activity", "refId": "c_schedule_reinf_suburban" },
        { "x": 1000, "y": 386, "id": "activity:c_schedule_reinf_rural", "type": "activity", "refId": "c_schedule_reinf_rural" },
        // Reinforcement queues
        { "x": 1080, "y": 138, "id": "queue:q_urban_reinf", "type": "queue", "refId": "q_urban_reinf" },
        { "x": 1080, "y": 262, "id": "queue:q_suburban_reinf", "type": "queue", "refId": "q_suburban_reinf" },
        { "x": 1080, "y": 386, "id": "queue:q_rural_reinf", "type": "queue", "refId": "q_rural_reinf" },
        // Reinforcement activities
        { "x": 1236, "y": 138, "id": "activity:c_reinforce_urban", "type": "activity", "refId": "c_reinforce_urban" },
        { "x": 1236, "y": 262, "id": "activity:c_reinforce_suburban", "type": "activity", "refId": "c_reinforce_suburban" },
        { "x": 1236, "y": 386, "id": "activity:c_reinforce_rural", "type": "activity", "refId": "c_reinforce_rural" },
        // === NEW: Install schedule queues ===
        { "x": 1300, "y": 80, "id": "queue:q_urban_install_schedule", "type": "queue", "refId": "q_urban_install_schedule" },
        { "x": 1300, "y": 204, "id": "queue:q_suburban_install_schedule", "type": "queue", "refId": "q_suburban_install_schedule" },
        { "x": 1300, "y": 328, "id": "queue:q_rural_install_schedule", "type": "queue", "refId": "q_rural_install_schedule" },
        // === NEW: Install schedule activities ===
        { "x": 1375, "y": 80, "id": "activity:c_schedule_install_urban", "type": "activity", "refId": "c_schedule_install_urban" },
        { "x": 1375, "y": 204, "id": "activity:c_schedule_install_suburban", "type": "activity", "refId": "c_schedule_install_suburban" },
        { "x": 1375, "y": 328, "id": "activity:c_schedule_install_rural", "type": "activity", "refId": "c_schedule_install_rural" },
        // Installation queues
        { "x": 1475, "y": 80, "id": "queue:q_urban_install", "type": "queue", "refId": "q_urban_install" },
        { "x": 1475, "y": 204, "id": "queue:q_suburban_install", "type": "queue", "refId": "q_suburban_install" },
        { "x": 1475, "y": 328, "id": "queue:q_rural_install", "type": "queue", "refId": "q_rural_install" },
        // Installation activities
        { "x": 1647, "y": 80, "id": "activity:c_install_urban", "type": "activity", "refId": "c_install_urban" },
        { "x": 1647, "y": 204, "id": "activity:c_install_suburban", "type": "activity", "refId": "c_install_suburban" },
        { "x": 1647, "y": 328, "id": "activity:c_install_rural", "type": "activity", "refId": "c_install_rural" },
        // Commissioning queues
        { "x": 1839, "y": 80, "id": "queue:q_urban_commission", "type": "queue", "refId": "q_urban_commission" },
        { "x": 1839, "y": 204, "id": "queue:q_suburban_commission", "type": "queue", "refId": "q_suburban_commission" },
        { "x": 1839, "y": 328, "id": "queue:q_rural_commission", "type": "queue", "refId": "q_rural_commission" },
        // Commissioning activities
        { "x": 2031, "y": 80, "id": "activity:c_commission_urban", "type": "activity", "refId": "c_commission_urban" },
        { "x": 2031, "y": 204, "id": "activity:c_commission_suburban", "type": "activity", "refId": "c_commission_suburban" },
        { "x": 2031, "y": 328, "id": "activity:c_commission_rural", "type": "activity", "refId": "c_commission_rural" },
        // Sinks
        { "x": 2223, "y": 80, "id": "sink:b_urban_commissioned", "type": "sink", "refId": "b_urban_commissioned" },
        { "x": 2223, "y": 204, "id": "sink:b_suburban_commissioned", "type": "sink", "refId": "b_suburban_commissioned" },
        { "x": 2223, "y": 328, "id": "sink:b_rural_commissioned", "type": "sink", "refId": "b_rural_commissioned" },
        // Training pipeline
        { "x": 232, "y": 552, "id": "queue:q_training", "type": "queue", "refId": "q_training" },
        { "x": 424, "y": 552, "id": "activity:c_train_installer", "type": "activity", "refId": "c_train_installer" },
        { "x": 616, "y": 552, "id": "sink:b_trainee_qualified", "type": "sink", "refId": "b_trainee_qualified" }
      ],
      "version": 1,
      "viewport": { "x": 0, "y": 0, "zoom": 1 }
    },
    "experimentDefaults": {
      "seed": 627060057,
      "maxSimTime": 260,
      "liveDataMode": null,
      "replications": 40,
      "warmupPeriod": 21,
      "terminationMode": "time",
      "resultDetailLevel": "compact",
      "terminationCondition": null
    },
    "timeUnit": "workingDays",
    "description": "Working-time clock variant. Multiply all time metrics by 1.4 for calendar-day equivalents.",
    "sections": [
      {
        "id": "sec_demand",
        "name": "Household Demand & Assessment",
        "color": "#4A90D9",
        "memberIds": [
          "et_urban_hh", "et_suburban_hh", "et_rural_hh", "et_surveyor",
          "q_urban_assess", "q_suburban_assess", "q_rural_assess",
          "b_urban_arrives", "b_suburban_arrives", "b_rural_arrives",
          "b_urban_assessed", "b_suburban_assessed", "b_rural_assessed",
          "c_assess_urban", "c_assess_suburban", "c_assess_rural"
        ]
      },
      {
        "id": "sec_dno",
        "name": "DNO Approval & Reinforcement",
        "color": "#E74C3C",
        "memberIds": [
          "et_dno_officer", "et_dno_crew",
          "q_urban_dno_desk", "q_suburban_dno_desk", "q_rural_dno_desk",
          "q_urban_reinf_schedule", "q_suburban_reinf_schedule", "q_rural_reinf_schedule",
          "q_urban_reinf", "q_suburban_reinf", "q_rural_reinf",
          "b_urban_dno_reviewed", "b_suburban_dno_reviewed", "b_rural_dno_reviewed",
          "b_urban_reinf_scheduled", "b_suburban_reinf_scheduled", "b_rural_reinf_scheduled",
          "b_urban_reinforced", "b_suburban_reinforced", "b_rural_reinforced",
          "c_dno_review_urban", "c_dno_review_suburban", "c_dno_review_rural",
          "c_schedule_reinf_urban", "c_schedule_reinf_suburban", "c_schedule_reinf_rural",
          "c_reinforce_urban", "c_reinforce_suburban", "c_reinforce_rural"
        ]
      },
      {
        "id": "sec_installation",
        "name": "Installation & Commissioning",
        "color": "#27AE60",
        "memberIds": [
          "et_installer", "et_commissioning",
          "q_urban_install_schedule", "q_suburban_install_schedule", "q_rural_install_schedule",
          "q_urban_install", "q_suburban_install", "q_rural_install",
          "q_urban_commission", "q_suburban_commission", "q_rural_commission",
          "b_urban_install_scheduled", "b_suburban_install_scheduled", "b_rural_install_scheduled",
          "b_urban_installed", "b_suburban_installed", "b_rural_installed",
          "b_urban_commissioned", "b_suburban_commissioned", "b_rural_commissioned",
          "c_schedule_install_urban", "c_schedule_install_suburban", "c_schedule_install_rural",
          "c_install_urban", "c_install_suburban", "c_install_rural",
          "c_commission_urban", "c_commission_suburban", "c_commission_rural"
        ]
      },
      {
        "id": "sec_training",
        "name": "Installer Training Pipeline",
        "color": "#8E44AD",
        "memberIds": [
          "et_trainee", "et_training", "q_training",
          "b_trainee_arrives", "b_trainee_qualified", "c_train_installer",
          "sv_rural_blocked", "sv_trainees_qualified"
        ]
      }
    ]
  },
  "exportedAt": new Date().toISOString(),
  "appVersion": "0.9.0 - Beta",
  "description": "RASE-converted model with working-day clock and scheduling delays. Time unit is working days. Multiply by 1.4 for calendar-day estimates."
};

// Write output
const outputPath = path.join(__dirname, 'heat-pump-rase.json');
fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
console.log('Model written to:', outputPath);
console.log('Stats:');
console.log('  Entity types:', model.model_json.entityTypes.length);
console.log('  Queues:', model.model_json.queues.length);
console.log('  B-Events:', model.model_json.bEvents.length);
console.log('  C-Events:', model.model_json.cEvents.length);
console.log('  Sections:', model.model_json.sections.length);
console.log('  Graph nodes:', model.model_json.graph.nodes.length);
