import React, { Component } from 'react';
import MakeRooms from './MakeRooms/MakeRooms';
import BoxList from '../../Layout/BoxList/BoxList';
import DashboardLayout from '../../Layout/Dashboard/Dashboard';
// import Dropdown from '../../Components/UI/Dropdown/Dropdown';
import Modal from '../../Components/UI/Modal/Modal';
import Button from '../../Components/UI/Button/Button';
import Aux from '../../Components/HOC/Auxil';
import TextInput from '../../Components/Form/TextInput/TextInput';
import * as actions from '../../store/actions';
import { connect } from 'react-redux';
import { populateResource } from '../../store/reducers/';
class Assignment extends Component {
  state = {
    tabs: [
      {name: 'Details'},
      {name: 'Rooms'},
      {name: 'Settings'},
    ],
    assigning: false,
  }

  render() {
    const resource = this.props.match.params.resource;
    const assignment = this.props.currentAssignment
    const course = this.props.currentCourse;
    let content;
    switch (resource) {
      case 'details':
        // @IDEA PERHAPS EXTRACT THIS OUT TO ITS OWN COMPONENT
        content = <div>
          <div>Assignment Name: {assignment.name}</div>
          <div>Details: {assignment.description}</div>
          <div>Type: {assignment.roomType}</div>
          <Button click={() => {this.setState({assigning: true})}}>Activate</Button>
        </div>
        break;
      case 'rooms':
        content = <BoxList list={this.props.currentAssignment.rooms} linkPath='/profile/rooms/' linkSuffix='/summary'/>
        break;
      default : content = null;
    }
    return (
      <Aux>
        <DashboardLayout
          routingInfo={this.props.match}
          crumbs={[
            {title: 'Profile', link: ''},
            {title: `${course.name}`, link: ''},
            {title: `${assignment.name}`, link: ''}
          ]}
          sidePanelTitle={'side panel'}
          content={content}
          tabs={this.state.tabs}
        />
        {this.state.assigning ? <Modal show={true} closeModal={() => {this.setState({assigning: false})}}>
          <MakeRooms
            assignment={assignment}
            course={course._id}
            userId={this.props.userId}
            close={() => {this.setState({assigning: false})}}
            students={course.members.filter(member => member.role === 'Student')}/>
        </Modal> : null}
      </Aux>
    )
  }
}

const mapStateToProps = (store, ownProps ) => {
  const { assignment_id, course_id } = ownProps.match.params;
  return {
    currentAssignment: populateResource(store, 'assignments', assignment_id, ['rooms']),
    // rooms:
    currentCourse: store.courses.byId[course_id],
    userId: store.user.id,
  }
}

// connect react functions to redux actions
const mapDispatchToProps = dispatch => {
  return {
    getCourses: () => dispatch(actions.getCourses()),
    getRooms: () => dispatch(actions.getRooms()),
    // updateUserCourses: newCourse => dispatch(actions.updateUserCourses(newCourse)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Assignment);
