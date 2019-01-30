import React from 'react';
import { Avatar, Button } from '../../Components/';
import classes from './members.css';
export default function SearchResults({usersSearched, inviteMember}) {
  return (
    <ul className={classes.SearchResults}>
      {usersSearched.map(user => {
        return <li className={classes.SearchResItem}>
          <Avatar username={user.username}/>
          <Button click={() => {inviteMember(user._id)}}>Add</Button>
        </li>
      })}
    </ul>
  )
}