import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2';

//access database for assets so you can save and retrieve 3D models

const MySQLStore = MySQLStoreFactory(session);
const connection = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the MySQL database.');
});

//also three.js will be used for rendering and manipulating 3D models here

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


