const express = require('express')
const app = express()
const cors = require('cors')
const mysql = require('mysql2/promise')
const pool = mysql.createPool({
  host: 'localhost',
  user: 'lcbird',
  password: '1140',
  database: 'newsdb'
})

app.use(cors())
app.use(express.json())


app.get('/', (request, response) => {
  response.send('<h1>its my version 0.1 i am link by mysql</h1>')
})

//app.get from mysql
app.get('/api/news', async (request, response) => {
    const [rows] = await pool.query('SELECT * FROM news')
    response.json(rows)
})

//app.get from mysql by id
app.get('/api/news/:id', async (request, response) => {
  const id = Number(request.params.id)
  const [rows] = await pool.query('SELECT * FROM news WHERE id = ?', [id])
  if (rows.length > 0) {
    response.json(rows[0])
  } else {
    response.status(404).json({ error: 'news not found' })
  }
})

const PORT = process.env.PORT||3001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

