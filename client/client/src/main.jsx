import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Editor from './Editor.jsx'
import { BrowserRouter,Routes,Route } from "react-router-dom";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
    <Routes>
      <Route path = "/meet" element = {<Editor/>}/>
    </Routes>
    </BrowserRouter>
  </StrictMode>,
)
