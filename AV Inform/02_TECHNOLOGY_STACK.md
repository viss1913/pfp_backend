# Technology Stack & System Architecture

## 💻 Tech Stack
Our platform utilizes a modular, high-availability technology stack focused on performance and security:

- **Backend**: Microservice-ready architecture based on **Node.js (LTS)** and **Express**. 
- **Database**: Relational Database Management System (RDBMS) with **Knex.js** query builder for structured financial data and transaction integrity.
- **Calculation Layer**: Custom-built simulation engine using pure JavaScript for maximum execution speed and predictability.
- **AI Integration**: Native integration with Google Gemini API for high-level semantic analysis and financial reasoning.
- **Frontend**: Modern SPA (Single Page Application) built with **React/Vite**, ensuring 60fps UI responsiveness.

## ⚙️ Core Modules
- **Modular Calculators**: Specialized engines for Pension, Rent, Investment, and Life Insurance that can be updated independently.
- **Event-Driven Simulation**: Simulates cash flows over 30-50 year periods, accounting for inflation and market volatility.
- **Smart Allocation Engine**: Proprietary logic that minimizes "financial burden" for the client while maximizing goal achievement.

## 🛡 Security & Reliability
- **Stateless API Design**: Ensures easy horizontal scaling and secure session management.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Agents, Admins, and Partners.
- **Data Integrity**: Enforced via atomic database transactions and strict input validation schemas (OpenAPI Specification).

---
*Technical Documentation | Antigravity PFP Platform*
