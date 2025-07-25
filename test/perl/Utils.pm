package Utils;

use strict;
use warnings;

sub helper_function {
    my ($data) = @_;
    return process_string($data);
}

sub process_string {
    my ($str) = @_;
    return uc($str);
}

sub export_data {
    my ($data) = @_;
    print "Exporting: $data\n";
}

1;
