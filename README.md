<div align='center'>
<img align='center' src="../frontend/static/logo-text.png" width='200px' />
</div>
<br>
</br>
<p align='center'>Discreetly is an anonymous, gated, chat application. Under the hood it uses a multiple zero-knowledge protocols such as RLN (Rate-Limiting Nullifier) to rate limit messages and Semaphore for identity management and group membership. </p>
<br>
</br>

# 📖 Contents

- [📖 Contents](#-contents)
- [📚 Technologies](#-technologies)
    - [**Semaphore**](#semaphore)
    - [**RLNjs**](#rlnjs)
    - [**Bandada**](#bandada)
    - [**Express.js**](#expressjs)
    - [**MongoDB**](#mongodb)
    - [**Prisma**](#prisma)
    - [**SocketIO**](#socketio)
- [📖 Getting started](#-getting-started)
    - [Install dependencies](#install-dependencies)
    - [Set environment variables given in the **.env.example**](#set-environment-variables-given-in-the-envexample)
    - [Initialize Prisma](#initialize-prisma)
    - [Run the server](#run-the-server)
    - [Running tests](#running-tests)
- [🔩 Usage](#-usage)
      - [Style Guide](#style-guide)

<br>

# 📚 Technologies

### **Semaphore**

Semaphore Identities are the core of Rate Limiting Nullifiers (RLN), CryptKeeper, and Bandada, providing support for anonymous signalling and experimental voting mechanisms within each chat room.

### **RLNjs**

Rate Limiting Nullifier (RLN) is used to control the frequency of user interactions, thereby providing a robust mechanism to prevent spam.

### **Bandada**

Bandada is employed for the management of user and group interactions within Semaphore Identity Commitments.

### **Express.js**

### **MongoDB**

### **Prisma**

### **SocketIO**

---

# 📖 Getting started

See the [frontend](https://github.com/Discreetly/frontend) to set that up as well

### Install dependencies

```
npm i
```

### Set environment variables given in the **.env.example**

```
PASSWORD= //password for admin endpoints
NODE_ENV= //development
DATABASE_URL= //MongoDB Atlas URL
DATABASE_URL_TEST= //MongoDB Atlas URL same or a seperate cluster for testing
```

### Initialize Prisma

```
npx prisma db init && npx prisma db push
```

### Run the server

```
npm run dev
```

Server information and endpoints will display in the console in development mode

### Running tests

```
npm run test
```

# 🔩 Usage

<table border="1">
  <tr>
    <th>Endpoint</th>
    <th>Expected Response</th>
  </tr>
  <tr>
    <td><pre>[ '/', '/api' ]</pre></td>
    <td><pre>Status: 200 OK<br>{
    "id": "0",
    "name": "localhost",
    "version": "0.0.2"
}</pre></td>
  </tr>
  <tr>
    <td><pre>[ '/rooms/:idc', '/api/rooms/:idc' ]</pre></td>
    <td><pre>Status: 200 OK<br>[
   ""
]</pre></td>
  </tr>
  <tr>
    <td><pre>[ '/room/:id', '/api/room/:id' ]</pre></td>
    <td><pre>Status: 200 OK<br>
{
    "roomId": "",
    "name": "",
    "rateLimit": ,
    "userMessageLimit":
}</pre></td>
  </tr>
  <tr>
  <td><pre>[ '/join', '/api/join' ]</pre></td>
  <td><pre>Status: 200 OK<br>
  {
    "status": "valid",
    "roomIds": [],
  }
    </pre></td>
  </tr>

</table>


#### Style Guide

* Single Quotes