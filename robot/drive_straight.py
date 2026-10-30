# VEXcode Python: drive straight and fix the heading if the robot gets knocked off course.
#
# Paste this BELOW the robot configuration that VEXcode generates for you
# (the part that creates `drivetrain` and defines `calibrate_drivetrain()`).
# The drivetrain needs a gyro / inertial sensor for heading to work.

# The direction the robot should drive in. 90 matches your original code.
# Change to 0 if you want it to keep driving the way it starts out facing.
TARGET_HEADING = 90

# How far off course (in degrees) the robot can drift before it corrects.
TOLERANCE = 3

calibrate_drivetrain()

drivetrain.set_turn_velocity(15, PERCENT)
drivetrain.set_drive_velocity(50, PERCENT)

# Face the target direction before driving.
drivetrain.turn_to_heading(TARGET_HEADING, DEGREES)


def heading_error():
    # Difference between where we are facing and where we should face,
    # kept between -180 and 180 so 359 vs 1 counts as 2 degrees, not 358.
    error = drivetrain.heading(DEGREES) - TARGET_HEADING
    while error > 180:
        error -= 360
    while error < -180:
        error += 360
    return error


while True:
    if abs(heading_error()) > TOLERANCE:
        # Knocked off course: stop, turn back to the target heading, then keep going.
        drivetrain.stop()
        drivetrain.turn_to_heading(TARGET_HEADING, DEGREES)

    drivetrain.drive(FORWARD)
    wait(20, MSEC)
