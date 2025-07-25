#!/usr/bin/perl

package MyModule::Utils;

use strict;
use warnings;
use Data::Dumper qw(Dumper);

our @EXPORT = qw(process_data);

sub new {
    my $class = shift;
    my $self = {
        data => [],
        config => {}
    };
    return bless $self, $class;
}

sub process_data {
    my ($self, $input) = @_;
    my @results = ();
    
    foreach my $item (@$input) {
        push @results, $self->transform_item($item);
    }
    
    return \@results;
}

sub transform_item {
    my ($self, $item) = @_;
    return uc($item);
}

1;
