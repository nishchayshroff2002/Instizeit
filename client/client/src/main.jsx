import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Meeting from "./MeetingLayout";
import { BrowserRouter,Routes,Route } from "react-router-dom";
import Login from './Login';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
    <Routes>
      <Route path = "/" element = {<Login/>}/>
      <Route path = "/meet" element = {<Meeting roomId="room1"/>}/>
    </Routes>
    </BrowserRouter>
  </StrictMode>,
)
