const mongoose = require('mongoose')

if(process.argv.length<3){
    console.log('give password as argument')
    process.exit(1)
}

const password = process.argv[3]

const url='mongodb+srv://bird:${password}@birdb.weqklox.mongodb.net/?appName=birdb'

mongoose.set('strictQuery', false)

mongoose.connect(url)

const noteSchema = new mongoose.Schema({
    title: String,
    important: Boolean,
})

const Note = mongoose.model('Note', noteSchema)

const note = new Note({
    title: 'HTML is easy',
    important: true,
})

note.save().then(result => {
    console.log('note saved!')
    mongoose.connection.close()
})

// Note.find({}).then(result => {
//   result.forEach(note => {
//     console.log(note)
//   })
//   mongoose.connection.close()
// })